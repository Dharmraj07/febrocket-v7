require("dotenv").config();

const app = require("./app");
const config = require("./config");

let server;
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`Received ${signal}. Shutting down Transformation Service...`);

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }).catch((error) => {
      console.error("HTTP server shutdown error:", error.message);
      process.exitCode = 1;
    });
  }
}

function startServer() {
  if (!config.transformationServiceApiKey) {
    throw new Error("TRANSFORMATION_SERVICE_API_KEY must be configured.");
  }

  server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`Transformation Service running on port ${config.port}`);
    console.log(`Environment: ${config.nodeEnv}`);
  });

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  return server;
}

if (require.main === module) {
  try {
    startServer();
  } catch (error) {
    console.error("Failed to start Transformation Service:", error.message);
    process.exit(1);
  }
}

module.exports = { app, startServer, shutdown };
