require("dotenv").config();

const { startDocumentWorker } = require("./workers/documentWorker");

let worker;

async function shutdown(signal) {
  console.log(`Received ${signal}. Shutting down Processing Service...`);
  if (worker) {
    await worker.close();
    worker = null;
  }
  process.exitCode = 0;
}

function startServer() {
  if (!process.env.PROCESSING_SERVICE_API_KEY) {
    throw new Error("PROCESSING_SERVICE_API_KEY must be configured.");
  }
  if (!process.env.DOCUMENT_SERVICE_URL) {
    throw new Error("DOCUMENT_SERVICE_URL must be configured.");
  }

  worker = startDocumentWorker();
  console.log("Document processing worker started");

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  return worker;
}

if (require.main === module) {
  try {
    startServer();
  } catch (error) {
    console.error("Failed to start Processing Service:", error.message);
    process.exitCode = 1;
  }
}

module.exports = { startServer, shutdown };
