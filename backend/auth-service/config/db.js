const mongoose = require("mongoose");
const config = require("./index");

const connectDB = async (retries = 5, backoff = 1000) => {
  if (!config.mongoUri) {
    throw new Error("MONGO_URI is not set. Cannot start without database connection.");
  }

  try {
    const conn = await mongoose.connect(config.mongoUri);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📦 Database: ${conn.connection.name}`);
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    if (retries > 0) {
      console.log(`Retrying in ${backoff}ms. Attempts left: ${retries}`);
      await new Promise((r) => setTimeout(r, backoff));
      return connectDB(retries - 1, Math.min(backoff * 2, 30000));
    }
    throw new Error("Could not connect to MongoDB after multiple attempts.");
  }
};

module.exports = connectDB;
