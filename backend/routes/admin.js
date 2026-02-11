const express = require('express');
const router = express.Router();
const { Student } = require('../database/models');
const { authenticateAdmin } = require('../middleware/auth');

const MONTHLY_FEE = 400;

// Get dashboard statistics
router.get('/dashboard', authenticateAdmin, async (req, res) => {
  try {
    // Get total students
    const totalStudents = await Student.countDocuments();

    // Get payment statistics  
    const students = await Student.find().lean();
    let totalRevenue = 0;
    let totalPending = 0;
    let paidStudents = 0;
    let pendingStudents = 0;

    students.forEach(student => {
      const paidAmount = Number(student.paid_amount || 0);
      totalRevenue += paidAmount;
      totalPending += Number(student.pending_amount || 0);
      
      if (paidAmount >= MONTHLY_FEE) {
        paidStudents += 1;
      } else {
        pendingStudents += 1;
      }
    });

    console.log('[admin] GET /dashboard success', { totalStudents, paidStudents, pendingStudents });

    res.json({
      totalStudents,
      totalRevenue,
      totalPending,
      paidStudents,
      pendingStudents
    });
  } catch (error) {
    console.error('[admin] GET /dashboard error:', error.message);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
