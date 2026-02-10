const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, authenticateAdmin } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

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

// Admin: move student between batches (seat-safe)
router.patch(
  '/move-student',
  authenticateAdmin,
  [
    body('student_id').isInt().withMessage('student_id is required'),
    body('batch').isIn(['morning', 'afternoon', 'evening']).withMessage('Batch must be morning/afternoon/evening'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { student_id, batch } = req.body;
    console.log('[batches] move-student payload:', { student_id, batch });
    db.serialize(() => {
      db.run('BEGIN IMMEDIATE TRANSACTION');
      db.get(`SELECT id, batch FROM students WHERE id = ?`, [student_id], (err, student) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Database error' });
        }
        if (!student) {
          db.run('ROLLBACK');
          return res.status(404).json({ error: 'Student not found' });
        }
        if (student.batch === batch) {
          db.run('ROLLBACK');
          return res.status(400).json({ error: 'Student is already in this batch' });
        }

        getBatchSummary(batch, (err2, summary) => {
          if (err2 || !summary) {
            db.run('ROLLBACK');
            return res.status(400).json({ error: 'Invalid batch' });
          }
          if (summary.available <= 0) {
            db.run('ROLLBACK');
            return res.status(400).json({ error: 'Selected batch is full' });
          }

          const query = `UPDATE students SET batch = ? WHERE id = ?`;
          console.log('[batches] executing SQL:', query, [batch, student_id]);
          db.run(query, [batch, student_id], function (err3) {
            if (err3) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'Database error' });
            }
            db.run('COMMIT');
            return res.json({ message: 'Student moved', batch });
          });
        });
      });
    });
  }
);

module.exports = router;

