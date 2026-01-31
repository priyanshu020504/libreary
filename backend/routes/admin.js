const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateAdmin } = require('../middleware/auth');

// Get dashboard statistics
router.get('/dashboard', authenticateAdmin, (req, res) => {
  // Get total students
  db.get('SELECT COUNT(*) as total FROM students', (err, studentsResult) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    // DISPLAY ONLY totals: revenue = sum(paid_amount), pending = sum(pending_amount)
    db.get(
      `SELECT 
         COALESCE(SUM(paid_amount), 0) as totalRevenue,
         COALESCE(SUM(pending_amount), 0) as totalPending
       FROM students`,
      (err2, sums) => {
        if (err2) return res.status(500).json({ error: 'Database error' });

        db.get(`SELECT COUNT(*) as paidStudents FROM students WHERE COALESCE(pending_amount, 0) <= 0`, (err3, paidCount) => {
          if (err3) return res.status(500).json({ error: 'Database error' });

          db.get(`SELECT COUNT(*) as pendingStudents FROM students WHERE COALESCE(pending_amount, 0) > 0`, (err4, pendingCount) => {
            if (err4) return res.status(500).json({ error: 'Database error' });

            res.json({
              totalStudents: studentsResult.total,
              totalRevenue: sums.totalRevenue || 0,
              totalPending: sums.totalPending || 0,
              paidStudents: paidCount.paidStudents || 0,
              pendingStudents: pendingCount.pendingStudents || 0
            });
          });
        });
      }
    );
  });
});

module.exports = router;
