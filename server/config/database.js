const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gacha-fight';
const RETRY_MS = 5000;

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    console.log(`Retrying in ${RETRY_MS / 1000}s... (start MongoDB with: mongod)`);
  }
  setTimeout(connectDB, RETRY_MS);
};

module.exports = connectDB;
