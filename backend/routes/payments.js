const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, authenticateAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const MONTHLY_FEE = 400;

// Get payments for a student
router.get('/student/:studentId', authenticateToken, (req, res) => {
  const { studentId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  // Students can only view their own payments
  if (userRole === 'student' && parseInt(studentId) !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.all(
    'SELECT * FROM payments WHERE student_id = ? ORDER BY payment_date DESC',
    [studentId],
    (err, payments) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(payments);
    }
  );
});

// Get payment statistics for a student
router.get('/student/:studentId/stats', authenticateToken, (req, res) => {
  const { studentId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  if (userRole === 'student' && parseInt(studentId) !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Get student details
  db.get('SELECT * FROM students WHERE id = ?', [studentId], (err, student) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Get all payments
    db.all(
      'SELECT * FROM payments WHERE student_id = ? ORDER BY payment_date DESC',
      [studentId],
      (err, payments) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        // DISPLAY ONLY totals:
        // Fixed total fee calculation based on membership duration
        const startDate = new Date(student.membership_start_date);
        const endDate = new Date(student.membership_end_date);
        const monthsDiff = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24 * 30)));
        const totalFee = monthsDiff * MONTHLY_FEE;

        // Admin manually sets paid_amount, remaining is calculated
        const paidAmount = Number(student.paid_amount || 0);
        const remaining = Math.max(0, totalFee - paidAmount);

        const paidCount = payments.length;

        res.json({
          monthlyFee: MONTHLY_FEE,
          membershipStartDate: student.membership_start_date,
          membershipEndDate: student.membership_end_date,
          monthlyDueDate: student.monthly_due_date,
          totalFee,
          paidAmount,
          remaining,
          paidCount,
          paymentStatus: remaining <= 0 ? 'paid' : 'pending',
          payments
        });
      }
    );
  });
});

// Create payment (Admin only)
router.post('/', authenticateAdmin, [
  body('student_id').isInt().withMessage('Valid student ID is required'),
  body('amount').isFloat({ min: 0 }).withMessage('Valid amount is required'),
  body('payment_date').notEmpty().withMessage('Payment date is required'),
  body('month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1-12'),
  body('year').isInt({ min: 2020 }).withMessage('Valid year is required')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { student_id, amount, payment_date, month, year, status = 'paid' } = req.body;

  // Check if payment already exists for this month/year
  db.get(
    'SELECT id FROM payments WHERE student_id = ? AND month = ? AND year = ?',
    [student_id, month, year],
    (err, existing) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (existing) {
        return res.status(400).json({ error: 'Payment already recorded for this month' });
      }

      db.run(
        'INSERT INTO payments (student_id, amount, payment_date, status, month, year) VALUES (?, ?, ?, ?, ?, ?)',
        [student_id, amount, payment_date, status, month, year],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Error creating payment' });
          }

          res.status(201).json({
            id: this.lastID,
            student_id,
            amount,
            payment_date,
            status,
            month,
            year
          });
        }
      );
    }
  );
});

// Update payment (Admin only)
router.put('/:id', authenticateAdmin, [
  body('amount').optional().isFloat({ min: 0 }).withMessage('Valid amount is required'),
  body('payment_date').optional().notEmpty().withMessage('Payment date cannot be empty'),
  body('status').optional().isIn(['paid', 'pending']).withMessage('Status must be paid or pending')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const updates = req.body;

  const fields = [];
  const values = [];

  if (updates.amount !== undefined) {
    fields.push('amount = ?');
    values.push(updates.amount);
  }
  if (updates.payment_date) {
    fields.push('payment_date = ?');
    values.push(updates.payment_date);
  }
  if (updates.status) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(id);
  const query = `UPDATE payments SET ${fields.join(', ')} WHERE id = ?`;

  db.run(query, values, function(err) {
    if (err) {
      return res.status(500).json({ error: 'Error updating payment' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    db.get('SELECT * FROM payments WHERE id = ?', [id], (err, payment) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(payment);
    });
  });
});

// Delete payment (Admin only)
router.delete('/:id', authenticateAdmin, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM payments WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Error deleting payment' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json({ message: 'Payment deleted successfully' });
  });
});

module.exports = router;
