require("dotenv").config();

const nodeEnv = process.env.NODE_ENV || "development";
const port = Number(process.env.PORT || 3004);
const jwtAccessSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET_KEY || null;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

if (nodeEnv === "production" && !jwtAccessSecret) {
  throw new Error(
    "JWT_ACCESS_SECRET or JWT_SECRET_KEY must be configured in production."
  );
}

module.exports = {
  port,
  jwtAccessSecret,
  mongoUri: process.env.MONGO_URI || null,
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || null,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || null,
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || null,
  nodeEnv,
  allowedOrigins: (process.env.FRONTEND_URL || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};
