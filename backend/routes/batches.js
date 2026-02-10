const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, authenticateAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { safeUpdateStudent } = require('../services/safeUpdateService');

function getBatchSummary(name, cb) {
  db.get(`SELECT name, total_seats FROM batches WHERE name = ?`, [name], (err, batch) => {
    if (err) return cb(err);
    if (!batch) return cb(null, null);
    db.get(`SELECT COUNT(*) as filled FROM students WHERE batch = ?`, [name], (err2, count) => {
      if (err2) return cb(err2);
      const filled = count?.filled || 0;
      const available = Math.max(0, batch.total_seats - filled);
      cb(null, { ...batch, filled, available });
    });
  });
}

// Public: list all batches with seat availability
router.get('/', (req, res) => {
  db.all(`SELECT name, total_seats FROM batches ORDER BY id ASC`, (err, batches) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    const names = (batches || []).map((b) => b.name);
    const results = [];
    let pending = names.length;
    if (pending === 0) return res.json([]);
    names.forEach((name) => {
      getBatchSummary(name, (e, summary) => {
        if (!e && summary) results.push(summary);
        pending -= 1;
        if (pending === 0) {
          // preserve order
          const ordered = names.map((n) => results.find((r) => r.name === n)).filter(Boolean);
          res.json(ordered);
        }
      });
    });
  });
});

const MONTHLY_FEE = 400;

function studentPaymentStatus(student) {
  const startDate = new Date(student.membership_start_date);
  const endDate = new Date(student.membership_end_date);
  const monthsDiff = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24 * 30)));
  const totalFee = monthsDiff * MONTHLY_FEE;
  const paidAmount = Number(student.paid_amount || 0);
  const remaining = Math.max(0, totalFee - paidAmount);
  return {
    ...student,
    // PAID only when paidAmount >= totalFee
    paymentStatus: paidAmount >= totalFee ? 'paid' : 'pending',
    totalFee,
    remaining,
  };
}

// Admin: get one batch + students in it (full details + payment status)
router.get('/:name', authenticateAdmin, (req, res) => {
  const { name } = req.params;
  getBatchSummary(name, (err, summary) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!summary) return res.status(404).json({ error: 'Batch not found' });

    db.all(
      `SELECT id, name, mobile, parent_mobile, address, batch, membership_start_date, membership_end_date, monthly_due_date, paid_amount, pending_amount, created_at
       FROM students WHERE batch = ? ORDER BY created_at DESC`,
      [name],
      (err2, students) => {
        if (err2) return res.status(500).json({ error: 'Database error' });
        const studentsWithStatus = (students || []).map(studentPaymentStatus);
        res.json({ batch: summary, students: studentsWithStatus });
      }
    );
  });
});

// Admin: update batch seat capacity
router.put(
  '/:name',
  authenticateAdmin,
  [body('total_seats').isInt({ min: 0 }).withMessage('total_seats must be >= 0')],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name } = req.params;
    const { total_seats } = req.body;
    db.run(`UPDATE batches SET total_seats = ? WHERE name = ?`, [total_seats, name], function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (this.changes === 0) return res.status(404).json({ error: 'Batch not found' });
      return res.json({ message: 'Batch updated' });
    });
  }
);

// Student cannot change batch after registration — batch is set only during Create Account. Only admin can change a student's batch.
router.patch(
  '/me',
  authenticateToken,
  [body('batch').isIn(['morning', 'afternoon', 'evening']).withMessage('Batch must be morning/afternoon/evening')],
  (req, res) => {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });
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
    body('student_id').isInt().withMessage('student_id is required'),
    body('batch').isIn(['morning', 'afternoon', 'evening']).withMessage('Batch must be morning/afternoon/evening'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { student_id, batch } = req.body;

    // HARD VALIDATION: student_id must be provided and valid
    if (!student_id) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    const parsedId = parseInt(student_id, 10);
    if (isNaN(parsedId) || parsedId <= 0) {
      return res.status(400).json({ error: 'Student ID must be a valid positive number' });
    }

    console.log('[batches] move-student payload:', { student_id: parsedId, batch });

    try {
      // Check if student exists and get current batch
      const student = await new Promise((resolve, reject) => {
        db.get(`SELECT id, batch FROM students WHERE id = ?`, [parsedId], (err, s) => {
          if (err) reject(err);
          else if (!s) reject(new Error('Student not found'));
          else resolve(s);
        });
      });

      if (student.batch === batch) {
        return res.status(400).json({ error: 'Student is already in this batch' });
      }

      // Check if batch is valid and has space
      const summary = await new Promise((resolve, reject) => {
        db.get(`SELECT total_seats FROM batches WHERE name = ?`, [batch], (err, b) => {
          if (err) return reject(err);
          if (!b) return reject(new Error('Invalid batch'));
          db.get(`SELECT COUNT(*) as filled FROM students WHERE batch = ?`, [batch], (err2, count) => {
            if (err2) return reject(err2);
            const filled = count?.filled || 0;
            const available = Math.max(0, b.total_seats - filled);
            if (available <= 0) return reject(new Error('Selected batch is full'));
            resolve({ total: b.total_seats, filled, available });
          });
        });
      });

      // Use safe update to move student
      const updatedStudent = await safeUpdateStudent(parsedId, { batch });
      res.json({ message: 'Student moved safely', batch, student: updatedStudent });
    } catch (error) {
      console.error('[batches] move-student error:', error.message);
      res.status(400).json({ error: error.message });
    }
  }
);

module.exports = router;

