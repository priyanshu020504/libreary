const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { authenticateToken, authenticateAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { safeUpdateStudent, safeDeleteStudent } = require('../services/safeUpdateService');

// Get all students (Admin only)
router.get('/', authenticateAdmin, (req, res) => {
  const { search, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM students';
  let params = [];

  if (search) {
    query += ' WHERE name LIKE ? OR mobile LIKE ? OR parent_mobile LIKE ? OR address LIKE ?';
    params = [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`];
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  db.all(query, params, (err, students) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    // Calculate payment status for each student
    const MONTHLY_FEE = 400;
    const studentsWithStatus = students.map((student) => {
      const totalFee = MONTHLY_FEE;
      const paidAmount = Number(student.paid_amount || 0);
      const remaining = Math.max(0, totalFee - paidAmount);

      // PAID only when paidAmount >= totalFee (strict rule)
      return {
        ...student,
        paymentStatus: paidAmount >= totalFee ? 'paid' : 'pending',
        totalFee,
        remaining,
      };
    });

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM students';
    let countParams = [];

    if (search) {
      countQuery += ' WHERE name LIKE ? OR mobile LIKE ? OR parent_mobile LIKE ? OR address LIKE ?';
      countParams = [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`];
    }

    db.get(countQuery, countParams, (err, countResult) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      res.json({
        students: studentsWithStatus,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult.total,
          pages: Math.ceil(countResult.total / limit)
        }
      });
    });
  });
});

// Get student by ID
router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  // Students can only view their own profile
  if (userRole === 'student' && parseInt(id) !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.get('SELECT * FROM students WHERE id = ?', [id], (err, student) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // For admin, include password hash; for students, remove it
    if (userRole !== 'admin') {
      delete student.password;
    }
    res.json(student);
  });
});

// Create new student (Admin only)
router.post('/', authenticateAdmin, [
  body('name').notEmpty().withMessage('Name is required'),
  body('mobile').isMobilePhone('en-IN').withMessage('Invalid mobile number'),
  body('parent_mobile').isMobilePhone('en-IN').withMessage('Invalid parent mobile number'),
  body('address').trim().isLength({ min: 10 }).withMessage('Address must be at least 10 characters'),
  body('batch').isIn(['morning', 'afternoon', 'evening']).withMessage('Batch must be morning/afternoon/evening'),
  body('timing').notEmpty().withMessage('Timing is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('membership_start_date').notEmpty().withMessage('Membership start date is required'),
  body('membership_end_date').notEmpty().withMessage('Membership end date is required'),
  body('monthly_due_date').isInt({ min: 1, max: 31 }).withMessage('Monthly due date must be between 1-31')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, mobile, parent_mobile, address, batch, timing, password, membership_start_date, membership_end_date, monthly_due_date } = req.body;

  // Check if mobile already exists
  db.get('SELECT id FROM students WHERE mobile = ?', [mobile], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (existing) {
      return res.status(400).json({ error: 'Mobile number already registered' });
    }

    // Seat availability check
    db.get(`SELECT total_seats FROM batches WHERE name = ?`, [batch], (err2, b) => {
      if (err2) return res.status(500).json({ error: 'Database error' });
      if (!b) return res.status(400).json({ error: 'Invalid batch selected' });
      db.get(`SELECT COUNT(*) as filled FROM students WHERE batch = ?`, [batch], (err3, c) => {
        if (err3) return res.status(500).json({ error: 'Database error' });
        const filled = c?.filled || 0;
        const available = Math.max(0, b.total_seats - filled);
        if (available <= 0) return res.status(400).json({ error: 'Selected batch is full' });

        bcrypt.hash(password, 10, (err, hashedPassword) => {
          if (err) {
            return res.status(500).json({ error: 'Error hashing password' });
          }

          // Parse timing into start_time and end_time if possible (format: "HH:MM - HH:MM" or any string)
          let start_time = null;
          let end_time = null;
          if (typeof timing === 'string' && timing.includes('-')) {
            const parts = timing.split('-').map((p) => p.trim());
            if (parts.length >= 2) {
              start_time = parts[0];
              end_time = parts[1];
            }
          }

          db.run(
            'INSERT INTO students (name, mobile, parent_mobile, address, batch, timing, start_time, end_time, password, membership_start_date, membership_end_date, monthly_due_date, paid_amount, pending_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)',
            [name, mobile, parent_mobile, address, batch, timing, start_time, end_time, hashedPassword, membership_start_date, membership_end_date, monthly_due_date],
            function(err) {
              if (err) {
                return res.status(500).json({ error: 'Error creating student' });
              }

              res.status(201).json({
                id: this.lastID,
                name,
                mobile,
                parent_mobile,
                address,
                batch,
                membership_start_date,
                membership_end_date,
                monthly_due_date
              });
            }
          );
        });
      });
    });
  });
});

// Update student (Admin only) - SAFE update with transaction-like protection
router.put('/:id', authenticateAdmin, async (req, res) => {
  const id = req.params.id;

  try {
    const updatedStudent = await safeUpdateStudent(id, req.body);
    res.json({ message: 'Student updated safely', student: updatedStudent });
  } catch (error) {
    console.error('[students] PUT /:id error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Update payment totals (Admin only) - SAFE atomic update
router.patch('/:id/payment-totals', authenticateAdmin, [
  body('paid_amount').isFloat({ min: 0, max: 400 }).withMessage('paid_amount must be between 0 and 400'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { paid_amount } = req.body;

  try {
    const MONTHLY_FEE = 400;
    const normalizedPaid = Math.min(Math.max(Number(paid_amount), 0), MONTHLY_FEE);
    const remaining = Math.max(0, MONTHLY_FEE - normalizedPaid);

    // Use safe update to modify payment fields
    const updatedStudent = await safeUpdateStudent(id, {
      paid_amount: normalizedPaid,
      pending_amount: remaining
    });

    return res.json({
      message: 'Payment totals updated safely',
      paid_amount: normalizedPaid,
      remaining,
      student: updatedStudent
    });
  } catch (error) {
    console.error('[students] PATCH /:id/payment-totals error:', error.message);
    return res.status(400).json({ error: error.message });
  }
});

// Delete student (Admin only) - SAFE delete with cascade
router.delete('/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await safeDeleteStudent(id, true);
    res.json(result);
  } catch (error) {
    console.error('[students] DELETE /:id error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
