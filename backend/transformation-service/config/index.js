require("dotenv").config();

const { getEnvNumber, getEnvBoolean } = require("../helpers/env");

const nodeEnv = process.env.NODE_ENV || "development";
const fallbackKey =
  process.env.TRANSFORMATION_SERVICE_API_KEY ||
  (nodeEnv === "production" ? null : "bc857e1d2f5654e1cf0fff17dc003dd8f3dc12373918e542f252836f80edcb9a");

if (nodeEnv === "production" && !fallbackKey) {
  throw new Error("TRANSFORMATION_SERVICE_API_KEY must be configured in production.");
}

module.exports = {
  port: getEnvNumber("PORT", 8080),
  nodeEnv,
  allowedOrigins: (process.env.CLIENT_URL || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  documentServiceUrl: process.env.DOCUMENT_SERVICE_URL || "http://localhost:3002",
  redisUrl: process.env.REDIS_URL || "",
  transformationQueueName: process.env.TRANSFORMATION_QUEUE_NAME || "document-transformation",
  transformationWorkerConcurrency: getEnvNumber("TRANSFORMATION_WORKER_CONCURRENCY", 2),
  maxFileSize: getEnvNumber("TRANSFORMATION_MAX_FILE_SIZE", 10 * 1024 * 1024),
  tempTtlMs: getEnvNumber("TRANSFORMATION_TEMP_TTL_MS", 300000),
  transformationTimeoutMs: getEnvNumber("TRANSFORMATION_TIMEOUT_MS", 60000),
  transformationServiceApiKey: fallbackKey,
  serviceApiHeader: "x-transformation-service-key",
  useRedisQueue: getEnvBoolean("USE_REDIS_QUEUE", false),
};
