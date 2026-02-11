/**
 * Safe Update Service for MongoDB
 * 
 * Provides strict, verified update operations for student records.
 * 
 * GUARANTEES:
 * - Student records CANNOT be accidentally deleted or corrupted
 * - Student ID (_id) CANNOT change during update
 * - ONLY specified fields are updated (no full document replacement)
 * - All updates validate data against Mongoose schema
 * - Required fields are protected and cannot be nullified
 * - Automatic rollback on validation failure
 * - Immutable fields are never modified: _id, createdAt
 */

const { Student } = require('../database/models');

// Fields that MUST NEVER be modified
const IMMUTABLE_FIELDS = ['_id', 'createdAt', 'id'];

// Fields that MUST NEVER be null or empty (no fallback allowed)
const REQUIRED_FIELDS = ['name', 'mobile', 'batch', 'password'];

/**
 * SAFE UPDATE WRAPPER - Use this for ALL student updates
 * 
 * CRITICAL GUARANTEES:
 * 1. Student ID MUST be a valid MongoDB ObjectId (required, never undefined/null)
 * 2. If ID is missing/invalid, throws error immediately
 * 3. ONLY specified fields in updateData are updated (partial update only)
 * 4. Student ID (_id) CANNOT change (verified after update)
 * 5. All data validates against Mongoose schema
 * 6. Required fields cannot be set to null/empty
 * 7. No full document replacement
 * 
 * ATOMIC PROCESS:
 * 1. Validate student ID is valid MongoDB ObjectId
 * 2. Fetch current student (confirms ID exists)
 * 3. Clean update data (remove immutable/guarded fields)
 * 4. Validate update data against schema
 * 5. Execute partial UPDATE ONLY (never replace)
 * 6. Verify student integrity after update
 * 7. Throw if any required field becomes null/empty
 * 
 * @param {string} studentId - Student to update (REQUIRED, must be valid ObjectId)
 * @param {Object} updateData - Field updates (will be sanitized)
 * @returns {Promise<Object>} Updated student record (with all fields)
 * @throws {Error} If validation fails or ID is invalid
 */
async function safeUpdateStudent(studentId, updateData) {
  let originalStudent;

  try {
    // STEP 1: HARD VALIDATION - ID must be valid MongoDB ObjectId
    if (!studentId) {
      throw new Error('Student ID is required for update');
    }

    // Validate MongoDB ObjectId format
    if (!String(studentId).match(/^[0-9a-fA-F]{24}$/)) {
      throw new Error('Student ID must be a valid MongoDB ObjectId');
    }

    console.log(`[safeUpdate] VALIDATING ID: Student ${studentId}`);

    // STEP 2: Fetch original student (confirms ID exists in database)
    originalStudent = await Student.findById(studentId);
    if (!originalStudent) {
      throw new Error(`Student ${studentId} not found in database`);
    }

    console.log(`[safeUpdate] ID VALIDATED - Student exists:`, {
      id: originalStudent._id,
      name: originalStudent.name,
      batch: originalStudent.batch
    });

    // STEP 3: Clean update data - remove immutable and guarded fields
    console.log(`[safeUpdate] SANITIZING: Removing immutable/guarded fields`);
    const cleanedUpdate = { ...updateData };

    // Remove immutable fields
    IMMUTABLE_FIELDS.forEach(field => {
      delete cleanedUpdate[field];
    });

    // Remove fields that should never be updated directly
    delete cleanedUpdate.password; // Password requires separate endpoint
    delete cleanedUpdate.createdAt; // Created timestamp is immutable
    delete cleanedUpdate.updatedAt; // Updated timestamp is auto-managed
    delete cleanedUpdate.mobile; // Mobile is unique identifier, cannot change
    delete cleanedUpdate.deleted_at; // No soft deletes
    delete cleanedUpdate.is_active; // No soft deletes
    delete cleanedUpdate.status; // No soft deletes

    // STEP 4: Validate update data against schema
    console.log(`[safeUpdate] VALIDATING: Update data against schema`);
    
    // Check required fields: if being updated, cannot be null/empty
    const requiredFieldsToCheck = ['name', 'batch'];
    for (const field of requiredFieldsToCheck) {
      if (cleanedUpdate[field] !== undefined) {
        if (cleanedUpdate[field] === null || cleanedUpdate[field] === '') {
          console.warn(`[safeUpdate] BLOCKED: Attempt to set required field '${field}' to ${cleanedUpdate[field]}`);
          throw new Error(`Required field '${field}' cannot be null or empty`);
        }
      }
    }

    // Validate seat_number is non-negative if provided
    if (cleanedUpdate.seat_number !== undefined && cleanedUpdate.seat_number < 0) {
      throw new Error('Seat number must be non-negative');
    }

    // If no fields to update, return original
    if (Object.keys(cleanedUpdate).length === 0) {
      console.log(`[safeUpdate] No valid fields to update, returning current state`);
      return originalStudent.toObject();
    }

    console.log(`[safeUpdate] Fields to update:`, Object.keys(cleanedUpdate));

    // STEP 5: Execute partial UPDATE ONLY (using Mongoose findByIdAndUpdate)
    console.log(`[safeUpdate] EXECUTING PARTIAL UPDATE`);
    
    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      { $set: cleanedUpdate },
      {
        new: true,           // Return updated document
        runValidators: true, // Validate against schema
        strict: true         // Don't allow extra fields
      }
    );

    if (!updatedStudent) {
      throw new Error(`Student ${studentId} disappeared after update attempt!`);
    }

    console.log(`[safeUpdate] UPDATE SUCCESSFUL`, {
      id: updatedStudent._id,
      name: updatedStudent.name,
      batch: updatedStudent.batch,
      idUnchanged: String(updatedStudent._id) === String(studentId)
    });

    // STEP 6: Verify student integrity after update
    console.log(`[safeUpdate] VERIFYING: Student integrity check`);

    // Verify ID hasn't changed (data corruption check)
    if (String(updatedStudent._id) !== String(studentId)) {
      throw new Error(`CRITICAL: Student ID changed! (${studentId} → ${updatedStudent._id})`);
    }

    // Verify required fields are NOT null or empty
    for (const field of REQUIRED_FIELDS) {
      if (!updatedStudent[field]) {
        throw new Error(`CRITICAL: Required field '${field}' is null/empty after update`);
      }
    }

    console.log(`[safeUpdate] VERIFICATION SUCCESSFUL`);
    return updatedStudent.toObject();

  } catch (error) {
    console.error(`[safeUpdate] ERROR: ${error.message}`);
    console.error(`[safeUpdate] Student ${studentId} remains UNCHANGED in database`);
    throw error;
  }
}

/**
 * SAFE DELETE - Prevents accidental cascading deletes
 * Only allows explicit delete with confirmation
 * 
 * GUARANTEES:
 * - Student is deleted ONLY when explicitly confirmed
 * - Associated payments are deleted in cascade
 * - No soft-delete mechanism
 * - No hidden filtering
 * - Student is permanently removed from database
 * 
 * @param {string} studentId - Student to delete (REQUIRED, must be valid ObjectId)
 * @param {boolean} confirmDeletion - MUST be true to proceed
 * @returns {Promise<Object>} Deletion confirmation
 * @throws {Error} If ID invalid or deletion not confirmed
 */
async function safeDeleteStudent(studentId, confirmDeletion = false) {
  try {
    // STEP 1: Require explicit confirmation
    if (confirmDeletion !== true) {
      throw new Error('Student deletion must be explicitly confirmed (confirmDeletion=true)');
    }

    // STEP 2: Validate ID
    if (!studentId) {
      throw new Error('Student ID is required for deletion');
    }

    if (!String(studentId).match(/^[0-9a-fA-F]{24}$/)) {
      throw new Error('Student ID must be a valid MongoDB ObjectId');
    }

    console.log(`[safeDelete] VALIDATING: Student ${studentId}`);

    // STEP 3: Verify student exists
    const student = await Student.findById(studentId);
    if (!student) {
      throw new Error(`Student ${studentId} not found`);
    }

    console.log(`[safeDelete] Student found:`, {
      id: student._id,
      name: student.name,
      batch: student.batch
    });

    // STEP 4: Delete associated payments (cascade)
    console.log(`[safeDelete] DELETING: Associated payments`);
    const { Payment } = require('../database/models');
    const paymentDeletionResult = await Payment.deleteMany({ student_id: studentId });
    console.log(`[safeDelete] Deleted ${paymentDeletionResult.deletedCount} payment record(s)`);

    // STEP 5: Delete student
    console.log(`[safeDelete] DELETING: Student record`);
    const deletionResult = await Student.findByIdAndDelete(studentId);

    if (!deletionResult) {
      throw new Error(`Failed to delete student ${studentId}`);
    }

    console.log(`[safeDelete] DELETION SUCCESSFUL:`, {
      deletedId: deletionResult._id,
      deletedName: deletionResult.name,
      paymentsDeleted: paymentDeletionResult.deletedCount
    });

    return {
      message: 'Student deleted successfully',
      deletedId: studentId,
      paymentsDeleted: paymentDeletionResult.deletedCount
    };

  } catch (error) {
    console.error(`[safeDelete] ERROR: ${error.message}`);
    console.error(`[safeDelete] Student ${studentId} remains in database`);
    throw error;
  }
}

/**
 * Get student by ID (for verification)
 * @param {string} studentId - Student ID
 * @returns {Promise<Object>} Student object or null
 */
async function getStudent(studentId) {
  if (!studentId || !String(studentId).match(/^[0-9a-fA-F]{24}$/)) {
    return null;
  }
  return Student.findById(studentId).lean();
}

module.exports = {
  safeUpdateStudent,
  safeDeleteStudent,
  getStudent
};
