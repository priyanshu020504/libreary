const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import database connection
const { connectToDatabase } = require('./database/mongodb');

// JWT fallback so auth works; set JWT_SECRET in Vercel env for production security
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = process.env.VERCEL ? 'vercel-production-secret-change-in-dashboard' : 'dev-secret-change-in-production';
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB on startup
let mongoConnected = false;
connectToDatabase()
  .then(() => {
    mongoConnected = true;
    console.log('[Server] ✅ MongoDB connected and ready');
  })
  .catch(err => {
    console.error('[Server] ⚠️  MongoDB connection failed on startup:', err.message);
    // In production, this is fatal. In development, we might retry.
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
      console.error('[Server] FATAL: Cannot start server without MongoDB in production');
      process.exit(1);
    }
  });

// CORS: allow Vercel frontend in production; allow all in development
const allowedOrigins = ['https://libreary-2fno.vercel.app', /^https:\/\/.*\.vercel\.app$/];
const corsOptions = {
  origin: process.env.VERCEL
    ? (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.some((o) => (typeof o === 'string' ? origin === o : o.test(origin)))) return cb(null, true);
        if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) return cb(null, true);
        return cb(null, false);
      }
    : (process.env.FRONTEND_URL || true),
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/students', require('./routes/students'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/batches', require('./routes/batches'));

// Root: avoid "Cannot GET /" on Vercel
app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'Library API', api: '/api/health' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Start server only when not on Vercel (serverless handles requests)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
