require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

const config = require("./config");
const transformationRoutes = require("./routes/transformationRoutes");

const app = express();

app.disable("x-powered-by");
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
);
app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));
app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = !origin || config.allowedOrigins.includes("*") || config.allowedOrigins.includes(origin);
      callback(null, allowed);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-transformation-service-key"],
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    service: "transformation-service",
    status: "ok",
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/transformation", transformationRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found.",
  });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled transformation-service error:", err.message || err);

  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      message: "Malformed JSON request body.",
    });
  }

  const statusCode = err.status || err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: err.message || "Internal server error.",
  });
});

module.exports = app;
