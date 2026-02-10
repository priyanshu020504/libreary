const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { authenticateToken, authenticateAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

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

      return {
        ...student,
        paymentStatus: remaining <= 0 ? 'paid' : 'pending',
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

// Update student (Admin only) - partial update only (safe $set-style)
router.put('/:id', authenticateAdmin, [
  body('name').optional().notEmpty().withMessage('Name cannot be empty'),
  body('mobile').optional().isMobilePhone('en-IN').withMessage('Invalid mobile number'),
  body('parent_mobile').optional().isMobilePhone('en-IN').withMessage('Invalid parent mobile number'),
  body('address').optional().trim().isLength({ min: 10 }).withMessage('Address must be at least 10 characters'),
  body('batch').optional().isIn(['morning', 'afternoon', 'evening']).withMessage('Batch must be morning/afternoon/evening'),
  // seat_number: allow any value (no uniqueness or strict range validation)
  body('membership_start_date').optional().notEmpty().withMessage('Membership start date cannot be empty'),
  body('membership_end_date').optional().notEmpty().withMessage('Membership end date cannot be empty'),
  body('monthly_due_date').optional().isInt({ min: 1, max: 31 }).withMessage('Monthly due date must be between 1-31'),
  body('timing').optional().notEmpty().withMessage('Timing cannot be empty'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const updates = req.body;

  // Build dynamic update query (partial update / $set semantics)
  const fields = [];
  const values = [];

  if (updates.name) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.mobile) {
    fields.push('mobile = ?');
    values.push(updates.mobile);
  }
  if (updates.parent_mobile) {
    fields.push('parent_mobile = ?');
    values.push(updates.parent_mobile);
  }
  if (updates.address) {
    fields.push('address = ?');
    values.push(updates.address);
  }
  // Handle batch and seat_number together to ensure consistency
  if (updates.batch || updates.seat_number !== undefined) {
    db.get('SELECT batch, seat_number FROM students WHERE id = ?', [id], (err, current) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!current) return res.status(404).json({ error: 'Student not found' });
      
      const targetBatch = updates.batch || current.batch;
      const targetSeatNumber = updates.seat_number !== undefined ? updates.seat_number : current.seat_number;
      
      // If batch is changing, check seat availability
      if (updates.batch && current.batch !== updates.batch) {
        db.get('SELECT total_seats FROM batches WHERE name = ?', [updates.batch], (err2, batch) => {
          if (err2) return res.status(500).json({ error: 'Database error' });
          if (!batch) return res.status(400).json({ error: 'Invalid batch' });
          
          db.get('SELECT COUNT(*) as filled FROM students WHERE batch = ?', [updates.batch], (err3, count) => {
            if (err3) return res.status(500).json({ error: 'Database error' });
            const filled = count?.filled || 0;
            const available = Math.max(0, batch.total_seats - filled);
            
            if (available <= 0) {
              return res.status(400).json({ error: 'Selected batch is full. Cannot change batch.' });
            }
            
            validateSeatAndUpdate();
          });
        });
      } else {
        validateSeatAndUpdate();
      }
      
      function validateSeatAndUpdate() {
        // Allow any seat number and duplicates; just set provided values
        if (updates.batch) {
          fields.push('batch = ?');
          values.push(targetBatch);
        }
        if (updates.seat_number !== undefined) {
          fields.push('seat_number = ?');
          values.push(targetSeatNumber);
        }
        processRemainingFields();
      }
    });
    return;
  }
  
  processRemainingFields();
  
  function processRemainingFields() {
    if (updates.membership_start_date) {
      fields.push('membership_start_date = ?');
      values.push(updates.membership_start_date);
    }
    if (updates.membership_end_date) {
      fields.push('membership_end_date = ?');
      values.push(updates.membership_end_date);
    }
    if (updates.monthly_due_date !== undefined) {
      fields.push('monthly_due_date = ?');
      values.push(updates.monthly_due_date);
    }
    if (updates.timing) {
      fields.push('timing = ?');
      values.push(updates.timing);
    }
    if (updates.password) {
      bcrypt.hash(updates.password, 10, (err, hashedPassword) => {
        if (err) {
          return res.status(500).json({ error: 'Error hashing password' });
        }
        fields.push('password = ?');
        values.push(hashedPassword);
        executeUpdate();
      });
      return;
    }

    executeUpdate();
  }
  
  function executeUpdate() {
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const query = `UPDATE students SET ${fields.join(', ')} WHERE id = ?`;

    db.run(query, values, function(err) {
      if (err) {
        return res.status(500).json({ error: 'Error updating student' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }

      db.get('SELECT * FROM students WHERE id = ?', [id], (err, student) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        // Admin can see password hash
        res.json(student);
      });
    });
  }
});

// Update payment totals (Admin only) - DISPLAY ONLY, fixed monthly fee
router.patch('/:id/payment-totals', authenticateAdmin, [
  body('paid_amount').isFloat({ min: 0, max: 400 }).withMessage('paid_amount must be between 0 and 400'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { paid_amount } = req.body;

  const MONTHLY_FEE = 400;
  const normalizedPaid = Math.min(Math.max(Number(paid_amount), 0), MONTHLY_FEE);
  const remaining = Math.max(0, MONTHLY_FEE - normalizedPaid);

  // Update paid_amount and pending_amount (remaining) atomically
  db.run(`UPDATE students SET paid_amount = ?, pending_amount = ? WHERE id = ?`, [normalizedPaid, remaining, id], function (err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (this.changes === 0) return res.status(404).json({ error: 'Student not found' });

    return res.json({ message: 'Payment totals updated', paid_amount: normalizedPaid, remaining });
  });
});

// Delete student (Admin only)
router.delete('/:id', authenticateAdmin, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM students WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Error deleting student' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Also delete associated payments
    db.run('DELETE FROM payments WHERE student_id = ?', [id], (err) => {
      if (err) {
        console.error('Error deleting payments:', err);
      }
    });

    res.json({ message: 'Student deleted successfully' });
  });
});

module.exports = router;
