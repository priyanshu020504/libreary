const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Dev-only fallback so backend runs locally without .env; production must set JWT_SECRET
if (!process.env.JWT_SECRET && !process.env.VERCEL) {
  process.env.JWT_SECRET = 'dev-secret-change-in-production';
}

const app = express();
const PORT = process.env.PORT || 5000;

// CORS: allow frontend origin in production, all in development
const corsOptions = {
  origin: process.env.FRONTEND_URL || true,
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
