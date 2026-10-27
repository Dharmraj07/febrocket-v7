require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const config = require("./config");
const connectDB = require("./config/db");
const messageRoutes = require("./routes/messageRoutes");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));
app.use(
  cors({
    origin: (origin, callback) => {
      const allowed =
        !origin ||
        config.allowedOrigins.includes("*") ||
        config.allowedOrigins.includes(origin);
      callback(null, allowed);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.get("/health", (_req, res) => {
  return res.status(200).json({
    success: true,
    service: "message-service",
    status: "ok",
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/messages", messageRoutes);

app.use((err, _req, res, _next) => {
  console.error("Message service error:", err.message || err);

  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      message: "Malformed JSON request body.",
    });
  }

  const statusCode = Number.isInteger(err.status) ? err.status : 500;
  return res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

const startServer = async () => {
  await connectDB();

  const server = await new Promise((resolve, reject) => {
    const listeningServer = app.listen(config.port, "0.0.0.0", () => {
      console.log(`Message Service running on port ${config.port}`);
      resolve(listeningServer);
    });

    listeningServer.once("error", reject);
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}. Shutting down Message Service...`);

    server.close(async (error) => {
      if (error) {
        console.error("HTTP server shutdown failed:", error.message);
        process.exitCode = 1;
      }

      try {
        await mongoose.disconnect();
      } catch (shutdownError) {
        console.error("MongoDB disconnect failed:", shutdownError.message);
        process.exitCode = 1;
      }
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  return server;
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start Message Service:", error.message);
    process.exit(1);
  });
}

module.exports = { app, startServer };
