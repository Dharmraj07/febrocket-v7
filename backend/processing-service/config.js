const { getEnvNumber } = require("./helpers/env");

module.exports = {
  port: Math.max(1, getEnvNumber("PORT", 5000)),
  workerConcurrency: Math.max(1, getEnvNumber("OCR_WORKER_CONCURRENCY", 2)),
};
