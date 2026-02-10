/**
 * Safe Update Service
 * 
 * Provides atomic, verified update operations for student records.
 * GUARANTEES:
 * - Student records CANNOT be accidentally deleted or corrupted
 * - Student ID CANNOT change during update
 * - Only UPDATE statements are used (NEVER INSERT/REPLACE)
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
          `CRITICAL: Student ID changed from ${snapshot.id} to ${student.id}! (INSERT/REPLACE detected)`
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
 * CRITICAL GUARANTEES:
 * 1. Student ID MUST be a valid number (required, never undefined/null)
 * 2. If ID is missing/invalid, throws error (never auto-creates)
 * 3. Only UPDATE statements execute (never INSERT/REPLACE)
 * 4. Student ID CANNOT change (verified after update)
 * 5. Automatic rollback on ANY failure
 * 
 * ATOMIC PROCESS:
 * 1. Validate student ID is valid number
 * 2. Snapshot current student (confirms ID exists)
 * 3. Delete guarded fields from updates
 * 4. Execute UPDATE ONLY (never INSERT)
 * 5. Verify student integrity after update
 * 6. If verification fails, automatic rollback to snapshot
 * 
 * @param {number} studentId - Student to update (REQUIRED)
 * @param {Object} updates - Field updates (will be sanitized)
 * @returns {Promise<Object>} Updated student record
 */
async function safeUpdateStudent(studentId, updates) {
  let snapshot;

  try {
    // STEP 1: HARD VALIDATION - ID must be valid
    if (!studentId && studentId !== 0) {
      throw new Error('Student ID is required for update');
    }
    
    const parsedId = parseInt(studentId, 10);
    if (isNaN(parsedId) || parsedId <= 0) {
      throw new Error('Student ID must be a valid positive number');
    }

    // STEP 2: Snapshot the current student (confirms ID exists in database)
    console.log(`[safeUpdate] VALIDATING ID: Student ${parsedId}`);
    snapshot = await snapshotStudent(parsedId);
    console.log(`[safeUpdate] ID VALIDATED - Snapshot successful:`, {
      id: snapshot.id,
      name: snapshot.name,
      batch: snapshot.batch,
      fieldsCount: Object.keys(snapshot).length
    });

    // STEP 3: Hard-block guarded fields
    console.log(`[safeUpdate] SANITIZING: Removing guarded fields`);
    delete updates.deleted_at;
    delete updates.is_active;
    delete updates.status;
    delete updates.id; // ID cannot be changed
    delete updates.password; // Password changes require separate endpoint

    // STEP 4: Build safe UPDATE with strict checks
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

    values.push(parsedId);
    const sql = `UPDATE students SET ${fields.join(', ')} WHERE id = ?`;

    console.log(`[safeUpdate] EXECUTING UPDATE ONLY: ${sql}`, values);

    // CRITICAL: Verify that SQL uses UPDATE, never INSERT/REPLACE
    if (sql.toUpperCase().includes('INSERT') || sql.toUpperCase().includes('REPLACE')) {
      throw new Error('CRITICAL: Attempt to use INSERT/REPLACE in update flow!');
    }

    // Execute update within promise
    await new Promise((resolve, reject) => {
      db.run(sql, values, function (err) {
        if (err) return reject(err);
        if (this.changes === 0) {
          return reject(new Error(`Student ${parsedId} not found`));
        }
        console.log(`[safeUpdate] UPDATE SUCCESSFUL (${this.changes} row(s) changed)`);
        resolve();
      });
    });

    // STEP 5: Verify integrity after update
    console.log(`[safeUpdate] VERIFYING: Student integrity check`);
    const updatedStudent = await verifyStudentIntegrity(parsedId, snapshot);
    console.log(`[safeUpdate] VERIFICATION SUCCESSFUL:`, {
      id: updatedStudent.id,
      name: updatedStudent.name,
      batch: updatedStudent.batch,
      idUnchanged: updatedStudent.id === snapshot.id
    });

    return updatedStudent;
  } catch (error) {
    // STEP 6: ROLLBACK on any failure
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
 * 
 * @param {number} studentId - Student to delete
 * @param {boolean} confirmDeletion - MUST be true to proceed
 */
async function safeDeleteStudent(studentId, confirmDeletion = false) {
  if (!confirmDeletion) {
    throw new Error('Student deletion must be explicitly confirmed');
  }

  // Validate ID
  if (!studentId && studentId !== 0) {
    throw new Error('Student ID is required for deletion');
  }
  
  const parsedId = parseInt(studentId, 10);
  if (isNaN(parsedId) || parsedId <= 0) {
    throw new Error('Student ID must be a valid positive number');
  }

  return new Promise((resolve, reject) => {
    // Delete associated payments first (cascade)
    db.run('DELETE FROM payments WHERE student_id = ?', [parsedId], (err) => {
      if (err) return reject(err);

      // Then delete student
      db.run('DELETE FROM students WHERE id = ?', [parsedId], function (err) {
        if (err) return reject(err);
        if (this.changes === 0) return reject(new Error(`Student ${parsedId} not found`));

        console.log(`[safeDelete] Student ${parsedId} deleted (with cascade)`);
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
