const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { body, validationResult } = require('express-validator');

function addDaysISO(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getBatchAvailability(batchName, cb) {
  db.get(`SELECT total_seats FROM batches WHERE name = ?`, [batchName], (err, batch) => {
    if (err) return cb({ status: 500, error: 'Database error' });
    if (!batch) return cb({ status: 400, error: 'Invalid batch selected' });
    db.get(`SELECT COUNT(*) as filled FROM students WHERE batch = ?`, [batchName], (err2, count) => {
      if (err2) return cb({ status: 500, error: 'Database error' });
      const filled = count?.filled || 0;
      const available = Math.max(0, batch.total_seats - filled);
      return cb(null, { total: batch.total_seats, filled, available });
    });
  });
}

// Single-step student registration (no OTP)
router.post(
  '/student/register',
  [
    body('name').trim().notEmpty().withMessage('Full name is required'),
    body('mobile').isMobilePhone('en-IN').withMessage('Invalid mobile number'),
    body('parent_mobile').isMobilePhone('en-IN').withMessage('Invalid parent mobile number'),
    body('address').trim().isLength({ min: 10 }).withMessage('Address must be at least 10 characters'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('batch').isIn(['morning', 'afternoon', 'evening']).withMessage('Batch must be morning/afternoon/evening'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, mobile, parent_mobile, address, password, batch } = req.body;

    db.get('SELECT id FROM students WHERE mobile = ?', [mobile], (err, existing) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (existing) return res.status(400).json({ error: 'Mobile number already registered' });

      getBatchAvailability(batch, (bErr, info) => {
        if (bErr) return res.status(bErr.status).json({ error: bErr.error });
        if (info.available <= 0) return res.status(400).json({ error: 'Selected batch is full. Please choose another batch.' });

        bcrypt.hash(password, 10, (hashErr, hashedPassword) => {
          if (hashErr) return res.status(500).json({ error: 'Error hashing password' });

          const today = new Date().toISOString().slice(0, 10);
          const startDate = today;
          const endDate = addDaysISO(today, 30);
          const monthlyDueDate = 1;

          db.run(
            `INSERT INTO students (name, mobile, parent_mobile, address, batch, password, membership_start_date, membership_end_date, monthly_due_date, paid_amount, pending_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
            [name, mobile, parent_mobile, address, batch, hashedPassword, startDate, endDate, monthlyDueDate],
            function (insertErr) {
              if (insertErr) {
                if (String(insertErr.message || '').toLowerCase().includes('unique')) {
                  return res.status(400).json({ error: 'Mobile number already registered' });
                }
                return res.status(500).json({ error: 'Error creating account' });
              }
              return res.status(201).json({ message: 'Registration successful. Please login.', studentId: this.lastID });
            }
          );
        });
      });
    });
  }
);

// Student login (mobile + password only)
router.post('/student/login', [
  body('mobile').isMobilePhone('en-IN').withMessage('Invalid mobile number'),
  body('password').notEmpty().withMessage('Password is required')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { mobile, password } = req.body;

  db.get('SELECT * FROM students WHERE mobile = ?', [mobile], (err, student) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!student) {
      return res.status(401).json({ error: 'Invalid mobile number or password' });
    }

    bcrypt.compare(password, student.password, (err, isMatch) => {
      if (err) {
        return res.status(500).json({ error: 'Authentication error' });
      }

      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid mobile number or password' });
      }

      const token = jwt.sign(
        { id: student.id, mobile: student.mobile, role: 'student' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        token,
        user: {
          id: student.id,
          name: student.name,
          mobile: student.mobile,
          role: 'student'
        }
      });
    });
  });
});

// Admin login (username + password only, no OTP)
router.post('/admin/login', [
  body('username').notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, password } = req.body;

  db.get('SELECT * FROM admin WHERE username = ?', [username], (err, admin) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!admin) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    bcrypt.compare(password, admin.password, (err, isMatch) => {
      if (err) {
        return res.status(500).json({ error: 'Authentication error' });
      }

      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const token = jwt.sign(
        { id: admin.id, username: admin.username, role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        token,
        user: {
          id: admin.id,
          username: admin.username,
          role: 'admin',
        },
      });
    });
  });
});

module.exports = router;
