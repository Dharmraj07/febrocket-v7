require("dotenv").config();

const { createServer } = require("node:http");
const { startDocumentWorker } = require("./workers/documentWorker");
const config = require("./config");

let worker;
let server;

async function shutdown(signal) {
  console.log(`Received ${signal}. Shutting down Processing Service...`);
  const shutdownTasks = [];

  if (server?.listening) {
    shutdownTasks.push(
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
    );
  }
  if (worker) shutdownTasks.push(worker.close());

  const results = await Promise.allSettled(shutdownTasks);
  server = null;
  worker = null;
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Processing Service shutdown failed:", result.reason.message);
      process.exitCode = 1;
    }
  }
  if (process.exitCode !== 1) process.exitCode = 0;
}

function createHealthServer() {
  return createServer((request, response) => {
    if (request.method !== "GET" || request.url?.split("?")[0] !== "/health") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ success: false, message: "Not found." }));
      return;
    }

    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      success: true,
      service: "processing-service",
      status: "ok",
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
    }));
  });
}

function startServer() {
  if (!process.env.PROCESSING_SERVICE_API_KEY) {
    throw new Error("PROCESSING_SERVICE_API_KEY must be configured.");
  }
  if (!process.env.DOCUMENT_SERVICE_URL) {
    throw new Error("DOCUMENT_SERVICE_URL must be configured.");
  }

  worker = startDocumentWorker();
  server = createHealthServer();
  server.listen(config.port, "0.0.0.0", () => {
    console.log(`Processing Service health endpoint listening on port ${config.port}`);
  });
  console.log("Document processing worker started");

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
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

module.exports = { createHealthServer, startServer, shutdown };
