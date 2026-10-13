const { getEnvNumber } = require("./helpers/env");

module.exports = {
  workerConcurrency: Math.max(1, getEnvNumber("OCR_WORKER_CONCURRENCY", 2)),
};
