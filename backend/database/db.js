/**
 * Vercel Postgres Database Layer
 * 
 * CRITICAL GUARANTEES:
 * - All student data is PERMANENTLY stored in Vercel Postgres
 * - Data NEVER auto-deletes
 * - Data persists across deployments and server restarts
 * - No in-memory storage, no SQLite, no local files
 * - Student IDs never change (primary key)
 * - Admin deletes ONLY remove from database, never use soft delete
 */

const { sql } = require('@vercel/postgres');
const bcrypt = require('bcryptjs');

// Wrapper to convert Promise-based API to callback style for compatibility
// This maintains backward compatibility with existing code using callbacks
class DatabaseWrapper {
  // Execute a query and return a single row
  get(query, params, callback) {
    this._execute(query, params)
      .then(result => {
        const row = result.rows[0] || null;
        callback(null, row);
      })
      .catch(err => callback(err));
  }

  // Execute a query and return all rows
  all(query, params, callback) {
    this._execute(query, params)
      .then(result => {
        callback(null, result.rows);
      })
      .catch(err => callback(err));
  }

  // Execute a query that modifies data (INSERT, UPDATE, DELETE)
  run(query, params, callback) {
    // If callback is not provided, handle it
    if (typeof callback !== 'function') {
      callback = params;
      params = [];
    }

    // For INSERT statements, automatically add RETURNING id if not present
    let finalQuery = query;
    if (query.trim().toUpperCase().startsWith('INSERT') && !query.toUpperCase().includes('RETURNING')) {
      // Add RETURNING id to get the inserted ID
      finalQuery = query.replace(/;?\s*$/, '') + ' RETURNING id';
    }

    this._execute(finalQuery, params)
      .then(result => {
        // Create context object with lastID and changes for compatibility
        const context = {
          lastID: result.rows[0]?.id,
          changes: result.rowCount || 0
        };
        if (typeof callback === 'function') {
          // Call callback with context binding for 'this'
          callback.call(context, null);
        }
      })
      .catch(err => {
        if (typeof callback === 'function') {
          callback.call({ changes: 0 }, err);
        }
      });
  }

  // Helper to execute raw SQL with parameter substitution
  async _execute(query, params = []) {
    try {
      // Convert ? placeholders to $1, $2, etc for Postgres
      let index = 1;
      const pgQuery = query.replace(/\?/g, () => `$${index++}`);
      
      const result = await sql.query(pgQuery, params);
      return result;
    } catch (error) {
      console.error('[Postgres Error]', error.message);
      throw error;
    }
  }

  // Initialize schema: create tables if they don't exist
  async initializeSchema() {
    try {
      console.log('[DB] Initializing Vercel Postgres schema...');

      // Create students table
      await sql`
        CREATE TABLE IF NOT EXISTS students (
          id SERIAL PRIMARY KEY,
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
        )
      `;
      console.log('[DB] students table ready');

      // Create payments table
      await sql`
        CREATE TABLE IF NOT EXISTS payments (
          id SERIAL PRIMARY KEY,
          student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
          amount REAL NOT NULL,
          payment_date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'paid',
          month TEXT NOT NULL,
          year INTEGER NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `;
      console.log('[DB] payments table ready');

      // Create admin table
      await sql`
        CREATE TABLE IF NOT EXISTS admin (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `;
      console.log('[DB] admin table ready');

      // Create batches table
      await sql`
        CREATE TABLE IF NOT EXISTS batches (
          id SERIAL PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          total_seats INTEGER NOT NULL DEFAULT 92,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `;
      console.log('[DB] batches table ready');

      // Seed default admin if not exists
      const adminResult = await sql`SELECT id FROM admin WHERE username = 'anandraj' LIMIT 1`;
      if (adminResult.rows.length === 0) {
        const defaultPassword = bcrypt.hashSync('RSCLIBRARY1', 10);
        await sql`INSERT INTO admin (username, password) VALUES ('anandraj', ${defaultPassword})`;
        console.log('[DB] Default admin created: username=anandraj, password=RSCLIBRARY1');
      }

      // Seed default batches if not exists
      const batchSeeds = [
        ['morning', 92],
        ['afternoon', 92],
        ['evening', 92],
      ];

      for (const [name, seats] of batchSeeds) {
        const batchResult = await sql`SELECT id FROM batches WHERE name = ${name} LIMIT 1`;
        if (batchResult.rows.length === 0) {
          await sql`INSERT INTO batches (name, total_seats) VALUES (${name}, ${seats})`;
        }
      }
      console.log('[DB] Batches seeded');

      console.log('[DB] Schema initialization complete - Data is now PERMANENTLY stored in Vercel Postgres');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('[DB] Tables already exist - using existing schema');
      } else {
        console.error('[DB] Schema initialization error:', error);
        throw error;
      }
    }
  }
}

const db = new DatabaseWrapper();

// Initialize schema on startup
if (process.env.POSTGRES_URL) {
  db.initializeSchema().catch(err => {
    console.error('[DB] Failed to initialize schema:', err);
    // Don't crash, Postgres might be unavailable during cold start
  });
} else {
  console.warn('[DB] WARNING: POSTGRES_URL not set! Data will not persist. Set POSTGRES_URL in environment.');
}

module.exports = db;

