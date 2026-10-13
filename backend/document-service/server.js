const app = require("./app");
const config = require("./config");
const connectDB = require("./config/db");
const mongoose = require("mongoose");
const { closeDocumentQueue } = require("./services/documentQueue");
const { closeDocumentProcessingEvents } = require("./services/documentProcessingEvents");
const { closeDocumentEventStreams } = require("./controllers/documentController");

let server;
let shuttingDown = false;

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\nReceived ${signal}. Gracefully shutting down...`);

  const reportFailures = (results) => {
    const failures = results.filter((result) => result.status === "rejected");
    for (const failure of failures) {
      console.error("Shutdown task failed:", failure.reason?.message || failure.reason);
    }
    if (failures.length) process.exitCode = 1;
  };

  if (server) {
    closeDocumentEventStreams();
    const httpClose = new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    reportFailures(await Promise.allSettled([httpClose]));
  }

  reportFailures(await Promise.allSettled([
    closeDocumentQueue(),
    closeDocumentProcessingEvents(),
  ]));
  reportFailures(await Promise.allSettled([
    mongoose.disconnect(),
  ]));
};

const startServer = async () => {
  try {
    console.log("🔄 Connecting to MongoDB...");
    await connectDB();
    console.log("✅ MongoDB connected");

    server = app.listen(config.port, "0.0.0.0", () => {
      console.log(`Document Service listening on port ${config.port}`);
    });

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    return server;
  } catch (error) {
    console.error("");
    console.error("❌ Failed to start Document Service");
    console.error("Reason:", error.message);
    await Promise.allSettled([
      closeDocumentQueue(),
      closeDocumentProcessingEvents(),
    ]);
    await Promise.allSettled([mongoose.disconnect()]);
    process.exitCode = 1;
    throw error;
  }
};

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer, shutdown };