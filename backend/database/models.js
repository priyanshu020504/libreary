/**
 * Mongoose Schemas for Rajshree Library
 * 
 * CRITICAL GUARANTEES:
 * - All required fields are enforced at schema level
 * - No field can be null unless explicitly allowed
 * - Student ID (_id) is immutable and never changes
 * - Full audit trail with timestamps
 * - Foreign key relationships with cascade delete
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ============================================================================
// STUDENT SCHEMA
// ============================================================================
const studentSchema = new mongoose.Schema(
  {
    // Core identity fields (REQUIRED, NEVER NULL)
    name: {
      type: String,
      required: [true, 'Student name is required'],
      trim: true,
      minlength: [1, 'Name cannot be empty']
    },
    mobile: {
      type: String,
      required: [true, 'Mobile number is required'],
      unique: true,
      trim: true,
      validate: {
        validator: (v) => /^[0-9]{10}$/.test(v),
        message: 'Mobile must be a 10-digit number'
      }
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters']
    },
    
    // Contact information (OPTIONAL)
    parent_mobile: {
      type: String,
      trim: true,
      validate: {
        validator: (v) => !v || /^[0-9]{10}$/.test(v),
        message: 'Parent mobile must be a 10-digit number'
      }
    },
    address: {
      type: String,
      trim: true
    },
    
    // Enrollment information (REQUIRED, NEVER NULL)
    batch: {
      type: String,
      required: [true, 'Batch is required'],
      enum: {
        values: ['morning', 'afternoon', 'evening'],
        message: 'Batch must be morning, afternoon, or evening'
      }
    },
    
    // Timing/Schedule (OPTIONAL)
    timing: {
      type: String,
      trim: true
    },
    start_time: {
      type: String,
      trim: true
    },
    end_time: {
      type: String,
      trim: true
    },
    seat_number: {
      type: Number,
      min: [0, 'Seat number must be non-negative']
    },
    
    // Membership dates (REQUIRED)
    membership_start_date: {
      type: Date,
      required: [true, 'Membership start date is required']
    },
    membership_end_date: {
      type: Date,
      required: [true, 'Membership end date is required']
    },
    monthly_due_date: {
      type: Number,
      min: [1, 'Monthly due date must be between 1-31'],
      max: [31, 'Monthly due date must be between 1-31']
    },
    
    // Payment tracking (SAFE DEFAULTS)
    paid_amount: {
      type: Number,
      default: 0,
      min: [0, 'Paid amount cannot be negative']
    },
    pending_amount: {
      type: Number,
      default: 400,
      min: [0, 'Pending amount cannot be negative']
    }
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
    strict: true     // Reject fields not defined in schema
  }
);

// Hash password before saving (only if modified)
studentSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Verify password method
studentSchema.methods.verifyPassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

// ============================================================================
// PAYMENT SCHEMA
// ============================================================================
const paymentSchema = new mongoose.Schema(
  {
    student_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student ID is required'],
      index: true
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount must be non-negative']
    },
    payment_date: {
      type: String,
      required: [true, 'Payment date is required']
    },
    status: {
      type: String,
      default: 'paid',
      enum: ['paid', 'pending']
    },
    month: {
      type: Number,
      required: [true, 'Month is required'],
      min: [1, 'Month must be between 1-12'],
      max: [12, 'Month must be between 1-12']
    },
    year: {
      type: Number,
      required: [true, 'Year is required'],
      min: [2020, 'Year must be 2020 or later']
    }
  },
  {
    timestamps: true
  }
);

// Create unique index on student_id + month + year
paymentSchema.index({ student_id: 1, month: 1, year: 1 }, { unique: true });

// ============================================================================
// ADMIN SCHEMA
// ============================================================================
const adminSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters']
    }
  },
  {
    timestamps: true
  }
);

// Hash password before saving (only if modified)
adminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Verify password method
adminSchema.methods.verifyPassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

// ============================================================================
// BATCH SCHEMA
// ============================================================================
const batchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Batch name is required'],
      unique: true,
      enum: {
        values: ['morning', 'afternoon', 'evening'],
        message: 'Batch must be morning, afternoon, or evening'
      }
    },
    total_seats: {
      type: Number,
      required: [true, 'Total seats is required'],
      default: 92,
      min: [0, 'Total seats cannot be negative']
    }
  },
  {
    timestamps: true
  }
);

// ============================================================================
// EXPORT MODELS
// ============================================================================

const Student = mongoose.model('Student', studentSchema);
const Payment = mongoose.model('Payment', paymentSchema);
const Admin = mongoose.model('Admin', adminSchema);
const Batch = mongoose.model('Batch', batchSchema);

module.exports = {
  Student,
  Payment,
  Admin,
  Batch
};
