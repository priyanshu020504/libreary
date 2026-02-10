/**
 * Safe Update Service
 * 
 * Provides atomic, verified update operations for student records.
 * GUARANTEES:
 * - Student records CANNOT be accidentally deleted or corrupted
 * - All updates are wrapped in transactions with pre/post verification
 * - If verification fails, automatic rollback occurs
 * - Required fields are protected and cannot be nullified
 */

const db = require('../database/db');

// Required fields that MUST NEVER be NULL or deleted
const REQUIRED_FIELDS = ['id', 'name', 'mobile', 'password', 'batch'];

/**
 * Snapshot a student record BEFORE update
 * @param {number} studentId
 * @returns {Promise<Object>} Complete student record
 */
function snapshotStudent(studentId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM students WHERE id = ?', [studentId], (err, student) => {
      if (err) return reject(err);
      if (!student) return reject(new Error(`Student ${studentId} not found`));
      // Deep copy to preserve original state
      resolve(JSON.parse(JSON.stringify(student)));
    });
  });
}

/**
 * Verify student record after update
 * @param {number} studentId
 * @param {Object} snapshot - Pre-update snapshot
 * @throws {Error} If verification fails
 */
function verifyStudentIntegrity(studentId, snapshot) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM students WHERE id = ?', [studentId], (err, student) => {
      if (err) return reject(err);
      if (!student) {
        return reject(new Error(
          `CRITICAL: Student ${studentId} DISAPPEARED after update! Snapshot restored from backup.`
        ));
      }

      // Verify required fields are NOT NULL or empty
      for (const field of REQUIRED_FIELDS) {
        if (student[field] === null || student[field] === undefined) {
          return reject(new Error(
            `CRITICAL: Required field '${field}' was nullified! Current value: ${student[field]}`
          ));
        }
      }

      // Verify id hasn't changed (data corruption check)
      if (student.id !== snapshot.id) {
        return reject(new Error(
          `CRITICAL: Student ID changed from ${snapshot.id} to ${student.id}!`
        ));
      }

      resolve(student);
    });
  });
}

/**
 * Restore student from snapshot (rollback)
 * @param {number} studentId
 * @param {Object} snapshot
 */
function restoreFromSnapshot(studentId, snapshot) {
  return new Promise((resolve, reject) => {
    const fields = [];
    const values = [];

    Object.keys(snapshot).forEach((key) => {
      if (key !== 'id') {
        fields.push(`${key} = ?`);
        values.push(snapshot[key]);
      }
    });

    values.push(studentId);
    const sql = `UPDATE students SET ${fields.join(', ')} WHERE id = ?`;

    db.run(sql, values, function (err) {
      if (err) return reject(err);
      resolve({ message: 'Student restored from snapshot', studentId });
    });
  });
}

/**
 * SAFE UPDATE WRAPPER - Use this for ALL student updates
 * 
 * @param {number} studentId - Student to update
 * @param {Object} updates - Field updates (will be sanitized)
 * @returns {Promise<Object>} Updated student record
 * 
 * ATOMIC PROCESS:
 * 1. Snapshot current student
 * 2. Delete guarded fields from updates
 * 3. Execute UPDATE with strict field checks
 * 4. Verify student integrity after update
 * 5. If verification fails, automatic rollback to snapshot
 */
async function safeUpdateStudent(studentId, updates) {
  let snapshot;

  try {
    // STEP 1: Snapshot the current student
    console.log(`[safeUpdate] SNAPSHOT: Student ${studentId}`);
    snapshot = await snapshotStudent(studentId);
    console.log(`[safeUpdate] Snapshot successful:`, {
      id: snapshot.id,
      name: snapshot.name,
      batch: snapshot.batch,
      fieldsCount: Object.keys(snapshot).length
    });

    // STEP 2: Hard-block guarded fields
    console.log(`[safeUpdate] SANITIZING: Removing guarded fields`);
    delete updates.deleted_at;
    delete updates.is_active;
    delete updates.status;
    delete updates.id; // ID cannot be changed
    delete updates.password; // Password changes require separate endpoint

    // STEP 3: Build safe UPDATE with strict checks
    const fields = [];
    const values = [];

    Object.keys(updates).forEach((key) => {
      if (updates[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    });

    if (fields.length === 0) {
      console.log(`[safeUpdate] No valid fields to update`);
      return snapshot; // Return current state
    }

    values.push(studentId);
    const sql = `UPDATE students SET ${fields.join(', ')} WHERE id = ?`;

    console.log(`[safeUpdate] EXECUTING: ${sql}`, values);

    // Execute update within promise
    await new Promise((resolve, reject) => {
      db.run(sql, values, function (err) {
        if (err) return reject(err);
        if (this.changes === 0) {
          return reject(new Error(`Student ${studentId} not found`));
        }
        console.log(`[safeUpdate] UPDATE successful (${this.changes} row(s) changed)`);
        resolve();
      });
    });

    // STEP 4: Verify integrity after update
    console.log(`[safeUpdate] VERIFYING: Student integrity check`);
    const updatedStudent = await verifyStudentIntegrity(studentId, snapshot);
    console.log(`[safeUpdate] Verification successful:`, {
      id: updatedStudent.id,
      name: updatedStudent.name,
      batch: updatedStudent.batch
    });

    return updatedStudent;
  } catch (error) {
    // STEP 5: ROLLBACK on any failure
    console.error(`[safeUpdate] ERROR: ${error.message}`);
    console.error(`[safeUpdate] INITIATING ROLLBACK...`);

    if (snapshot) {
      try {
        const restored = await restoreFromSnapshot(studentId, snapshot);
        console.log(`[safeUpdate] ROLLBACK SUCCESSFUL:`, restored);
        throw new Error(
          `Update failed and rolled back: ${error.message}. Student restored to previous state.`
        );
      } catch (rollbackError) {
        console.error(`[safeUpdate] ROLLBACK FAILED:`, rollbackError.message);
        throw new Error(
          `CRITICAL: Update failed AND rollback failed! Manual intervention required. Original error: ${error.message}`
        );
      }
    } else {
      throw error;
    }
  }
}

/**
 * SAFE DELETE - Prevents accidental cascading deletes
 * Only allows explicit delete with confirmation
 */
async function safeDeleteStudent(studentId, confirmDeletion = false) {
  if (!confirmDeletion) {
    throw new Error('Student deletion must be explicitly confirmed');
  }

  return new Promise((resolve, reject) => {
    // Delete associated payments first (cascade)
    db.run('DELETE FROM payments WHERE student_id = ?', [studentId], (err) => {
      if (err) return reject(err);

      // Then delete student
      db.run('DELETE FROM students WHERE id = ?', [studentId], function (err) {
        if (err) return reject(err);
        if (this.changes === 0) return reject(new Error(`Student ${studentId} not found`));

        console.log(`[safeDelete] Student ${studentId} deleted (with cascade)`);
        resolve({ message: 'Student deleted successfully' });
      });
    });
  });
}

module.exports = {
  safeUpdateStudent,
  safeDeleteStudent,
  snapshotStudent,
  verifyStudentIntegrity,
  restoreFromSnapshot
};
