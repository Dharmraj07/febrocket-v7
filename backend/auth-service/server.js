require("dotenv").config();

const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const passport = require("passport");

const config = require("./config");
require("./config/passport");
const connectDB = require("./config/db");
const mongoose = require("mongoose");
const { connectRedis, closeRedis } = require("./config/redis");
const authRoutes = require("./routes/authRoutes");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const app = express();

app.set("trust proxy", 1);

app.use(helmet());
app.use(morgan("combined"));
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(cookieParser());
app.use(passport.initialize());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    service: "auth-service",
    status: "ok",
    environment: config.nodeEnv,
  });
});

app.use("/api/auth", authRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async () => {
  try {
    await connectDB();
    await connectRedis();

    const server = app.listen(config.port, "0.0.0.0", () => {
      console.log(`Auth Service running on port ${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
    });

    let shuttingDown = false;
    const shutdown = (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`${signal} received; shutting down Auth Service`);

      server.close(async (error) => {
        if (error) {
          console.error("HTTP server shutdown failed:", error.message);
          process.exitCode = 1;
        }

        const results = await Promise.allSettled([
          mongoose.disconnect(),
          closeRedis(),
        ]);
        for (const result of results) {
          if (result.status === "rejected") {
            console.error("Service shutdown failed:", result.reason.message);
            process.exitCode = 1;
          }
        }
      });
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error("Failed to start Auth Service:", error.message);
    process.exit(1);
  }
};

startServer();
