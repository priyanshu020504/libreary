/**
 * MongoDB Connection Setup
 * 
 * CRITICAL GUARANTEES:
 * - All student data is PERMANENTLY stored in MongoDB Atlas
 * - Data NEVER auto-deletes
 * - Data persists across deployments and server restarts
 * - No in-memory storage, no ephemeral fs, no SQLite
 * - Student IDs never change (MongoDB _id is immutable)
 * - Admin deletes ONLY remove from database, never use soft delete
 * - All updates use strict Mongoose schemas with validation
 */

const mongoose = require('mongoose');

// Check for MONGODB_URI environment variable
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('[MongoDB] CRITICAL ERROR: MONGODB_URI environment variable is not set!');
  console.error('[MongoDB] Set MONGODB_URI in Vercel Project Settings > Environment Variables');
  console.error('[MongoDB] Format: mongodb+srv://username:password@cluster.mongodb.net/database_name?retryWrites=true&w=majority');
  
  // In development, we might want to continue, but in production this is fatal
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

// Define Mongoose connection options for Vercel serverless
const mongooseOptions = {
  serverSelectionTimeoutMS: 5000,
  retryWrites: true,
  maxPoolSize: 10,
  socketTimeoutMS: 45000,
};

let isConnected = false;

/**
 * Connect to MongoDB Atlas
 * Handles connection pooling for Vercel serverless environment
 */
async function connectToDatabase() {
  if (isConnected) {
    console.log('[MongoDB] Already connected, reusing connection');
    return mongoose.connection;
  }

  try {
    console.log('[MongoDB] Connecting to MongoDB Atlas...');
    
    const connection = await mongoose.connect(MONGODB_URI, mongooseOptions);
    
    isConnected = true;
    console.log('[MongoDB] ✅ Connected successfully');
    console.log('[MongoDB] Database:', connection.connection.name);
    console.log('[MongoDB] Host:', connection.connection.host);
    
    return connection;
  } catch (error) {
    console.error('[MongoDB] Connection failed:', error.message);
    isConnected = false;
    throw error;
  }
}

// Handle connection events
mongoose.connection.on('connected', () => {
  console.log('[MongoDB] Connection event: connected');
});

mongoose.connection.on('error', (err) => {
  console.error('[MongoDB] Connection event: error', err.message);
  isConnected = false;
});

mongoose.connection.on('disconnected', () => {
  console.log('[MongoDB] Connection event: disconnected');
  isConnected = false;
});

module.exports = {
  connectToDatabase,
  mongoose,
  isConnected: () => isConnected
};
