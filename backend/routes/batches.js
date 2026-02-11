const express = require('express');
const router = express.Router();
const { Student, Batch } = require('../database/models');
const { authenticateToken, authenticateAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { safeUpdateStudent } = require('../services/mongoSafeUpdate');

const MONTHLY_FEE = 400;

async function getBatchSummary(name) {
  const batch = await Batch.findOne({ name });
  if (!batch) return null;
  
  const filled = await Student.countDocuments({ batch: name });
  const available = Math.max(0, batch.total_seats - filled);
  
  return { name: batch.name, total_seats: batch.total_seats, filled, available };
}

function studentPaymentStatus(student) {
  const paidAmount = Number(student.paid_amount || 0);
  return {
    ...student,
    paymentStatus: paidAmount >= MONTHLY_FEE ? 'paid' : 'pending',
    totalFee: MONTHLY_FEE,
    remaining: Math.max(0, MONTHLY_FEE - paidAmount),
  };
}

// Public: list all batches with seat availability
router.get('/', async (req, res) => {
  try {
    const batches = await Batch.find().sort({ _id: 1 }).lean();
    const batchNames = batches.map(b => b.name);
    
    const results = [];
    for (const name of batchNames) {
      const summary = await getBatchSummary(name);
      if (summary) results.push(summary);
    }
    
    res.json(results);
  } catch (error) {
    console.error('[batches] GET / error:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Admin: get one batch + students in it (full details + payment status)
router.get('/:name', authenticateAdmin, async (req, res) => {
  try {
    const { name } = req.params;
    const summary = await getBatchSummary(name);
    
    if (!summary) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const students = await Student.find({ batch: name })
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();
    
    const studentsWithStatus = students.map(studentPaymentStatus);
    
    res.json({ batch: summary, students: studentsWithStatus });
  } catch (error) {
    console.error('[batches] GET /:name error:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Admin: update batch seat capacity
router.put(
  '/:name',
  authenticateAdmin,
  [body('total_seats').isInt({ min: 0 }).withMessage('total_seats must be >= 0')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name } = req.params;
      const { total_seats } = req.body;
      
      const result = await Batch.findOneAndUpdate(
        { name },
        { total_seats },
        { new: true }
      );
      
      if (!result) {
        return res.status(404).json({ error: 'Batch not found' });
      }
      
      console.log('[batches] PUT /:name success', { name });
      res.json({ message: 'Batch updated' });
    } catch (error) {
      console.error('[batches] PUT /:name error:', error.message);
      res.status(500).json({ error: 'Database error' });
    }
  }
);

// Student cannot change batch after registration
router.patch(
  '/me',
  authenticateToken,
  [body('batch').isIn(['morning', 'afternoon', 'evening']).withMessage('Batch must be morning/afternoon/evening')],
  (req, res) => {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Students only' });
    }
    return res.status(403).json({
      error: 'Batch can only be set during registration. Contact admin to change your batch.',
    });
  }
);

// Admin: move student between batches (seat-safe) - SAFE update
router.patch(
  '/move-student',
  authenticateAdmin,
  [
    body('student_id').notEmpty().withMessage('student_id is required'),
    body('batch').isIn(['morning', 'afternoon', 'evening']).withMessage('Batch must be morning/afternoon/evening'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { student_id, batch } = req.body;

      // Validate MongoDB ObjectId
      if (!String(student_id).match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ error: 'Invalid student ID format' });
      }

      console.log('[batches] PATCH /move-student payload:', { student_id, batch });

      // Check if student exists and get current batch
      const student = await Student.findById(student_id);
      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      if (student.batch === batch) {
        return res.status(400).json({ error: 'Student is already in this batch' });
      }

      // Check if batch is valid and has space
      const batchDoc = await Batch.findOne({ name: batch });
      if (!batchDoc) {
        return res.status(400).json({ error: 'Invalid batch selected' });
      }

      const filled = await Student.countDocuments({ batch });
      const available = Math.max(0, batchDoc.total_seats - filled);
      if (available <= 0) {
        return res.status(400).json({ error: 'Selected batch is full' });
      }

      // Use safe update to move student
      const updatedStudent = await safeUpdateStudent(student_id, { batch });
      console.log('[batches] PATCH /move-student success', { student_id });
      
      res.json({ message: 'Student moved safely', batch, student: updatedStudent });
    } catch (error) {
      console.error('[batches] PATCH /move-student error:', error.message);
      res.status(400).json({ error: error.message });
    }
  }
);

module.exports = router;

