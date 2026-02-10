const db = require('../database/db');

// Allowed columns in students table (must match schema)
const ALLOWED_FIELDS = new Set([
  'name',
  'mobile',
  'parent_mobile',
  'address',
  'batch',
  'start_time',
  'end_time',
  'seat_number',
  'paid_amount',
  'pending_amount',
  'membership_start_date',
  'membership_end_date'
]);

const cleanPayload = (payload) =>
  Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );

async function insertStudent(payload) {
  const cleaned = cleanPayload(payload);
  const cols = Object.keys(cleaned).filter((c) => ALLOWED_FIELDS.has(c));
  if (cols.length === 0) throw new Error('No valid student fields provided for insert');

  const placeholders = cols.map(() => '?').join(', ');
  const sql = `INSERT INTO students (${cols.join(', ')}) VALUES (${placeholders})`;
  const values = cols.map((c) => cleaned[c]);

  return new Promise((resolve, reject) => {
    db.run(sql, values, function (err) {
      if (err) return reject(err);
      // db.run binds context with lastID and changes
      resolve({ id: this.lastID || null, changes: this.changes || 0 });
    });
  });
}

async function updateSeatAndTimes(id, { seat_number, start_time, end_time, paid_amount }) {
  if (!id) throw new Error('Student id is required');
  const sql = `UPDATE students SET seat_number = ?, start_time = ?, end_time = ?, paid_amount = ? WHERE id = ?`;
  const values = [seat_number, start_time, end_time, paid_amount, id];

  return new Promise((resolve, reject) => {
    db.run(sql, values, function (err) {
      if (err) return reject(err);
      if ((this.changes || 0) === 0) return reject(new Error(`Student ${id} not found`));
      resolve({ id, changes: this.changes || 0 });
    });
  });
}

async function deleteStudentById(id) {
  if (!id) throw new Error('Student id is required');
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM students WHERE id = ?', [id], function (err) {
      if (err) return reject(err);
      if ((this.changes || 0) === 0) return reject(new Error(`Student ${id} not found`));
      resolve({ id, deleted: true });
    });
  });
}

module.exports = {
  cleanPayload,
  insertStudent,
  updateSeatAndTimes,
  deleteStudentById,
};
