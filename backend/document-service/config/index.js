require("dotenv").config();

const { getEnvNumber, getEnvBoolean } = require("../helpers/env");

const nodeEnv = process.env.NODE_ENV || "development";
const configuredJwtSecret = process.env.JWT_SECRET_KEY || null;
const jwtAccessSecret = process.env.JWT_ACCESS_SECRET || configuredJwtSecret;
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || configuredJwtSecret;
const isStrongJwtSecret = (secret) =>
  typeof secret === "string" &&
  Buffer.byteLength(secret, "utf8") >= 32 &&
  !/(replace|your|example|placeholder|change.?me|default)/i.test(secret);

if (
  !isStrongJwtSecret(jwtAccessSecret) ||
  !isStrongJwtSecret(jwtRefreshSecret) ||
  (!configuredJwtSecret && jwtAccessSecret === jwtRefreshSecret)
) {
  throw new Error(
    "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET (or JWT_SECRET_KEY) must be explicitly configured with non-placeholder values of at least 32 bytes; separate access and refresh secrets must differ."
  );
}

if (nodeEnv === "production" && !process.env.PROCESSING_SERVICE_API_KEY) {
  throw new Error("PROCESSING_SERVICE_API_KEY must be configured in production.");
}

module.exports = {
  port: getEnvNumber("PORT", 8080),
  mongoUri: process.env.MONGO_URI || null,
  jwtSecret: configuredJwtSecret || jwtAccessSecret,
  jwtAccessSecret,
  jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY || "15m",
  jwtRefreshSecret,
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || "90d",
  cookieSameSite: process.env.COOKIE_SAMESITE || "lax",
  cookieSecure: getEnvBoolean("COOKIE_SECURE", nodeEnv === "production"),
  emailUser: process.env.EMAIL_USER || null,
  emailPass: process.env.EMAIL_PASS || null,
  nodeEnv,
  allowedOrigins: (process.env.CLIENT_URL || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};
