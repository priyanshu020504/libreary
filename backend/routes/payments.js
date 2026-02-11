const express = require('express');
const router = express.Router();
const { Student, Payment } = require('../database/models');
const { authenticateToken, authenticateAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const MONTHLY_FEE = 400;

// Get payments for a student
router.get('/student/:studentId', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Students can only view their own payments
    if (userRole === 'student' && studentId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate MongoDB ObjectId
    if (!String(studentId).match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid student ID format' });
    }

    const payments = await Payment.find({ student_id: studentId })
      .sort({ payment_date: -1 })
      .lean();
    
    res.json(payments);
  } catch (error) {
    console.error('[payments] GET /student/:studentId error:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get payment statistics for a student
router.get('/student/:studentId/stats', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (userRole === 'student' && studentId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate MongoDB ObjectId
    if (!String(studentId).match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid student ID format' });
    }

    // Get student details
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Get all payments
    const payments = await Payment.find({ student_id: studentId })
      .sort({ payment_date: -1 })
      .lean();

    const totalFee = MONTHLY_FEE;
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
      paymentStatus: paidAmount >= totalFee ? 'paid' : 'pending',
      payments
    });
  } catch (error) {
    console.error('[payments] GET /student/:studentId/stats error:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create payment (Admin only)
router.post('/', authenticateAdmin, [
  body('student_id').notEmpty().withMessage('Valid student ID is required'),
  body('amount').isFloat({ min: 0 }).withMessage('Valid amount is required'),
  body('payment_date').notEmpty().withMessage('Payment date is required'),
  body('month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1-12'),
  body('year').isInt({ min: 2020 }).withMessage('Valid year is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { student_id, amount, payment_date, month, year, status = 'paid' } = req.body;

    // Validate MongoDB ObjectId
    if (!String(student_id).match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid student ID format' });
    }

    // Check if student exists
    const student = await Student.findById(student_id);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Check if payment already exists for this month/year
    const existing = await Payment.findOne({ student_id, month, year });
    if (existing) {
      return res.status(400).json({ error: 'Payment already recorded for this month' });
    }

    // Create new payment
    const newPayment = new Payment({
      student_id,
      amount,
      payment_date,
      status,
      month,
      year
    });

    await newPayment.save();
    console.log('[payments] POST / success: Payment created', { id: newPayment._id });

    res.status(201).json({
      id: newPayment._id,
      student_id,
      amount,
      payment_date,
      status,
      month,
      year
    });
  } catch (error) {
    console.error('[payments] POST / error:', error.message);
    if (error.code === 11000 || String(error.message).includes('duplicate')) {
      return res.status(400).json({ error: 'Payment already recorded for this month' });
    }
    res.status(500).json({ error: 'Error creating payment' });
  }
});

// Update payment (Admin only)
router.put('/:id', authenticateAdmin, [
  body('amount').optional().isFloat({ min: 0 }).withMessage('Valid amount is required'),
  body('payment_date').optional().notEmpty().withMessage('Payment date cannot be empty'),
  body('status').optional().isIn(['paid', 'pending']).withMessage('Status must be paid or pending')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updates = req.body;

    // Validate MongoDB ObjectId
    if (!String(id).match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid payment ID format' });
    }

    // Block dangerous updates
    if (updates.student_id !== undefined) {
      return res.status(400).json({ error: 'student_id cannot be modified' });
    }
    delete updates.deleted_at;
    delete updates.is_active;
    delete updates.payment_status;
    delete updates.totalFee;

    console.log('[payments] PUT /:id payload:', { id, updates });

    const updateFields = {};
    if (updates.amount !== undefined) updateFields.amount = updates.amount;
    if (updates.payment_date !== undefined) updateFields.payment_date = updates.payment_date;
    if (updates.status !== undefined) updateFields.status = updates.status;

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const payment = await Payment.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    console.log('[payments] PUT /:id success', { id });
    res.json(payment);
  } catch (error) {
    console.error('[payments] PUT /:id error:', error.message);
    res.status(500).json({ error: 'Error updating payment' });
  }
});

// Delete payment (Admin only)
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ObjectId
    if (!String(id).match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid payment ID format' });
    }

    const payment = await Payment.findByIdAndDelete(id);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    console.log('[payments] DELETE /:id success', { id });
    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    console.error('[payments] DELETE /:id error:', error.message);
    res.status(500).json({ error: 'Error deleting payment' });
  }
});

module.exports = router;
