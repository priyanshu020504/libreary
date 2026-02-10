const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');

// On Vercel use /tmp (writable); else use DATABASE_PATH or local file
const dbPath =
  process.env.DATABASE_PATH ||
  (process.env.VERCEL ? path.join(os.tmpdir(), 'library.db') : path.join(__dirname, 'library.db'));
const db = new sqlite3.Database(dbPath);

function ensureStudentsColumns() {
  db.all(`PRAGMA table_info(students)`, (err, rows) => {
    if (err) {
      console.error('Error reading students schema:', err);
      return;
    }

    const cols = new Set(rows.map((r) => r.name));

    // Add columns as nullable to avoid breaking existing databases.
    if (!cols.has('parent_mobile')) {
      db.run(`ALTER TABLE students ADD COLUMN parent_mobile TEXT`, (e) => {
        if (e) console.error('Error adding parent_mobile column:', e);
      });
    }

    if (!cols.has('address')) {
      db.run(`ALTER TABLE students ADD COLUMN address TEXT`, (e) => {
        if (e) console.error('Error adding address column:', e);
      });
    }

    if (!cols.has('batch')) {
      db.run(`ALTER TABLE students ADD COLUMN batch TEXT`, (e) => {
        if (e) console.error('Error adding batch column:', e);
      });
    }

    if (!cols.has('paid_amount')) {
      db.run(`ALTER TABLE students ADD COLUMN paid_amount REAL DEFAULT 0`, (e) => {
        if (e) console.error('Error adding paid_amount column:', e);
      });
    }

    if (!cols.has('pending_amount')) {
      db.run(`ALTER TABLE students ADD COLUMN pending_amount REAL DEFAULT 0`, (e) => {
        if (e) console.error('Error adding pending_amount column:', e);
      });
    }

    if (!cols.has('seat_number')) {
      db.run(`ALTER TABLE students ADD COLUMN seat_number INTEGER`, (e) => {
        if (e) console.error('Error adding seat_number column:', e);
      });
    }

    if (!cols.has('timing')) {
        db.run(`ALTER TABLE students ADD COLUMN timing TEXT`, (e) => {
          if (e) console.error('Error adding timing column:', e);
        });
      }

      if (!cols.has('start_time')) {
        db.run(`ALTER TABLE students ADD COLUMN start_time TEXT`, (e) => {
          if (e) console.error('Error adding start_time column:', e);
        });
      }

      if (!cols.has('end_time')) {
        db.run(`ALTER TABLE students ADD COLUMN end_time TEXT`, (e) => {
          if (e) console.error('Error adding end_time column:', e);
        });
    }
  });
}

function ensureBatchesSeeded() {
  db.run(
    `CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      total_seats INTEGER NOT NULL DEFAULT 92,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  );

  const seeds = [
    ['morning', 92],
    ['afternoon', 92],
    ['evening', 92],
  ];

  for (const [name, total] of seeds) {
    db.run(`INSERT OR IGNORE INTO batches (name, total_seats) VALUES (?, ?)`, [name, total]);
  }
}

// Initialize database
db.serialize(() => {
  // Students table
  db.run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mobile TEXT UNIQUE NOT NULL,
    parent_mobile TEXT,
    address TEXT,
    batch TEXT,
    timing TEXT,
    start_time TEXT,
    end_time TEXT,
    password TEXT NOT NULL,
    membership_start_date TEXT NOT NULL,
    membership_end_date TEXT NOT NULL,
    monthly_due_date INTEGER NOT NULL,
    paid_amount REAL DEFAULT 0,
    pending_amount REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  ensureStudentsColumns();
  ensureBatchesSeeded();

  // Payments table
  db.run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'paid',
    month TEXT NOT NULL,
    year INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id)
  )`);

  // Admin table
  db.run(`CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // Create default admin if not exists
  const bcrypt = require('bcryptjs');
  const defaultPassword = bcrypt.hashSync('RSCLIBRARY1', 10);
  db.run(`INSERT OR IGNORE INTO admin (username, password) VALUES (?, ?)`, ['anandraj', defaultPassword], (err) => {
    if (err) {
      console.error('Error creating default admin:', err);
    } else {
      console.log('Default admin created: username=anandraj, password=RSCLIBRARY1');
    }
  });
});

module.exports = db;
