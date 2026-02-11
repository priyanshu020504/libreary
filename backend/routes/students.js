const express = require('express');
const router = express.Router();
const { Student, Batch } = require('../database/models');
const { authenticateToken, authenticateAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { safeUpdateStudent, safeDeleteStudent } = require('../services/mongoSafeUpdate');

const MONTHLY_FEE = 400;

/**
 * Calculate payment status for a student
 */
function calcPaymentStatus(student) {
  const paidAmount = Number(student.paid_amount || 0);
  return {
    ...student,
    paymentStatus: paidAmount >= MONTHLY_FEE ? 'paid' : 'pending',
    totalFee: MONTHLY_FEE,
    remaining: Math.max(0, MONTHLY_FEE - paidAmount)
  };
}

// ============================================================================
// GET: All students (Admin only)
// ============================================================================
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 10));
    const skip = (pageNum - 1) * limitNum;

    // Build search query
    let searchQuery = {};
    if (search) {
      searchQuery = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { mobile: { $regex: search, $options: 'i' } },
          { parent_mobile: { $regex: search, $options: 'i' } },
          { address: { $regex: search, $options: 'i' } }
        ]
      };
    }

    // Fetch students
    const students = await Student.find(searchQuery)
      .select('-password') // Exclude password from response
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Calculate payment status for each
    const studentsWithStatus = students.map(calcPaymentStatus);

    // Get total count
    const total = await Student.countDocuments(searchQuery);

    res.json({
      students: studentsWithStatus,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('[students] GET / error:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================================================
// GET: Student by ID
// ============================================================================
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Students can only view their own profile
    if (userRole === 'student' && id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate MongoDB ObjectId
    if (!String(id).match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid student ID format' });
    }

    const student = await Student.findById(id).lean();
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // For students, remove password
    if (userRole !== 'admin') {
      delete student.password;
    }

    res.json(student);
  } catch (error) {
    console.error('[students] GET /:id error:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================================================
// POST: Create new student (Admin only)
// ============================================================================
router.post('/', authenticateAdmin, [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('mobile').isMobilePhone('en-IN').withMessage('Invalid mobile number'),
  body('parent_mobile').isMobilePhone('en-IN').withMessage('Invalid parent mobile number'),
  body('address').trim().isLength({ min: 10 }).withMessage('Address must be at least 10 characters'),
  body('batch').isIn(['morning', 'afternoon', 'evening']).withMessage('Batch must be morning/afternoon/evening'),
  body('timing').trim().notEmpty().withMessage('Timing is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('membership_start_date').notEmpty().withMessage('Membership start date is required'),
  body('membership_end_date').notEmpty().withMessage('Membership end date is required'),
  body('monthly_due_date').isInt({ min: 1, max: 31 }).withMessage('Monthly due date must be between 1-31')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name, mobile, parent_mobile, address, batch, timing,
      password, membership_start_date, membership_end_date, monthly_due_date
    } = req.body;

    // Check if mobile already exists
    const existing = await Student.findOne({ mobile });
    if (existing) {
      return res.status(400).json({ error: 'Mobile number already registered' });
    }

    // Verify batch exists and has space
    const batchDoc = await Batch.findOne({ name: batch });
    if (!batchDoc) {
      return res.status(400).json({ error: 'Invalid batch selected' });
    }

    const filledCount = await Student.countDocuments({ batch });
    if (filledCount >= batchDoc.total_seats) {
      return res.status(400).json({ error: 'Selected batch is full' });
    }

    // Parse timing into start_time and end_time
    let start_time = null;
    let end_time = null;
    if (typeof timing === 'string' && timing.includes('-')) {
      const parts = timing.split('-').map(p => p.trim());
      if (parts.length >= 2) {
        start_time = parts[0];
        end_time = parts[1];
      }
    }

    // Create new student
    const newStudent = new Student({
      name,
      mobile,
      parent_mobile,
      address,
      batch,
      timing,
      start_time,
      end_time,
      password, // Will be hashed by schema pre-save
      membership_start_date: new Date(membership_start_date),
      membership_end_date: new Date(membership_end_date),
      monthly_due_date,
      paid_amount: 0,
      pending_amount: MONTHLY_FEE
    });

    await newStudent.save();
    console.log('[students] POST / success: Student created', { id: newStudent._id, name });

    res.status(201).json({
      id: newStudent._id,
      name: newStudent.name,
      mobile: newStudent.mobile,
      parent_mobile: newStudent.parent_mobile,
      address: newStudent.address,
      batch: newStudent.batch,
      membership_start_date: newStudent.membership_start_date,
      membership_end_date: newStudent.membership_end_date,
      monthly_due_date: newStudent.monthly_due_date
    });
  } catch (error) {
    console.error('[students] POST / error:', error.message);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ error: messages.join('; ') });
    }
    res.status(500).json({ error: 'Error creating student' });
  }
});

// ============================================================================
// PUT: Update student (Admin only) - SAFE update
// ============================================================================
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ObjectId
    if (!String(id).match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid student ID format' });
    }

    // Use safe update logic
    const updatedStudent = await safeUpdateStudent(id, req.body);
    console.log('[students] PUT /:id success: Student updated', { id });
    
    res.json({ message: 'Student updated safely', student: updatedStudent });
  } catch (error) {
    console.error('[students] PUT /:id error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// PATCH: Update payment totals (Admin only)
// ============================================================================
router.patch('/:id/payment-totals', authenticateAdmin, [
  body('paid_amount').isFloat({ min: 0, max: 400 }).withMessage('paid_amount must be between 0 and 400'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { paid_amount } = req.body;

    // Validate MongoDB ObjectId
    if (!String(id).match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid student ID format' });
    }

    // Normalize payment amount
    const normalizedPaid = Math.min(Math.max(Number(paid_amount), 0), MONTHLY_FEE);
    const remaining = Math.max(0, MONTHLY_FEE - normalizedPaid);

    // Update using safe update
    const updatedStudent = await safeUpdateStudent(id, {
      paid_amount: normalizedPaid,
      pending_amount: remaining
    });

    console.log('[students] PATCH /:id/payment-totals success', { id });

    res.json({
      message: 'Payment totals updated safely',
      paid_amount: normalizedPaid,
      remaining,
      student: updatedStudent
    });
  } catch (error) {
    console.error('[students] PATCH /:id/payment-totals error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// DELETE: Delete student (Admin only) - SAFE delete
// ============================================================================
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ObjectId
    if (!String(id).match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid student ID format' });
    }

    // Use safe delete logic (requires explicit confirmation)
    const result = await safeDeleteStudent(id, true);
    console.log('[students] DELETE /:id success', { id });
    
    res.json(result);
  } catch (error) {
    console.error('[students] DELETE /:id error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
