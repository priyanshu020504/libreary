const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Student, Admin, Batch } = require('../database/models');
const { body, validationResult } = require('express-validator');

function addDaysISO(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getBatchAvailability(batchName) {
  const batch = await Batch.findOne({ name: batchName });
  if (!batch) throw new Error('Invalid batch selected');
  
  const filled = await Student.countDocuments({ batch: batchName });
  const available = Math.max(0, batch.total_seats - filled);
  
  return { total: batch.total_seats, filled, available };
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
    body('timing').trim().notEmpty().withMessage('Timing is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, mobile, parent_mobile, address, password, batch, timing } = req.body;

      // Check if mobile already exists
      const existing = await Student.findOne({ mobile });
      if (existing) {
        return res.status(400).json({ error: 'Mobile number already registered' });
      }

      // Check batch availability
      const info = await getBatchAvailability(batch);
      if (info.available <= 0) {
        return res.status(400).json({ error: 'Selected batch is full. Please choose another batch.' });
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

      const today = new Date().toISOString().slice(0, 10);
      const startDate = today;
      const endDate = addDaysISO(today, 30);
      const monthlyDueDate = 1;

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
        membership_start_date: new Date(startDate),
        membership_end_date: new Date(endDate),
        monthly_due_date: monthlyDueDate,
        paid_amount: 0,
        pending_amount: 400
      });

      await newStudent.save();
      console.log('[auth] POST /student/register success', { id: newStudent._id, name });

      return res.status(201).json({
        message: 'Registration successful. Please login.',
        studentId: newStudent._id
      });
    } catch (error) {
      console.error('[auth] POST /student/register error:', error.message);
      if (error.code === 11000 || String(error.message).includes('duplicate')) {
        return res.status(400).json({ error: 'Mobile number already registered' });
      }
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(e => e.message);
        return res.status(400).json({ error: messages.join('; ') });
      }
      res.status(500).json({ error: 'Error creating account' });
    }
  }
);

// Student login (mobile + password only)
router.post('/student/login', [
  body('mobile').isMobilePhone('en-IN').withMessage('Invalid mobile number'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { mobile, password } = req.body;

    const student = await Student.findOne({ mobile });
    if (!student) {
      return res.status(401).json({ error: 'Invalid mobile number or password' });
    }

    // Verify password
    const isMatch = await student.verifyPassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid mobile number or password' });
    }

    const token = jwt.sign(
      { id: student._id.toString(), mobile: student.mobile, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('[auth] POST /student/login success', { id: student._id });

    res.json({
      token,
      user: {
        id: student._id,
        name: student.name,
        mobile: student.mobile,
        role: 'student'
      }
    });
  } catch (error) {
    console.error('[auth] POST /student/login error:', error.message);
    res.status(500).json({ error: 'Authentication error' });
  }
});

// Admin login (username + password only, no OTP)
router.post('/admin/login', [
  body('username').notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password } = req.body;

    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Verify password
    const isMatch = await admin.verifyPassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { id: admin._id.toString(), username: admin.username, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('[auth] POST /admin/login success', { id: admin._id });

    res.json({
      token,
      user: {
        id: admin._id,
        username: admin.username,
        role: 'admin',
      },
    });
  } catch (error) {
    console.error('[auth] POST /admin/login error:', error.message);
    res.status(500).json({ error: 'Authentication error' });
  }
});

module.exports = router;
