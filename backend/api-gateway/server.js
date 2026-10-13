require("dotenv").config();

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const documentDataRoutes = require("./routes/documentDataRoutes");
const documentRoutes = require("./routes/documentRoutes");
const messageRoutes = require("./routes/messageRoutes");
const documentLibraryRoutes = require("./routes/documentLibraryRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const formsRoutes = require("./routes/formsRoutes");

const app = express();
const port = Number(process.env.PORT || 8080);
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposedHeaders: ["Content-Disposition"],
  })
);

app.get("/health", (_req, res) => {
  return res.status(200).json({
    success: true,
    service: "api-gateway",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/document-library", documentLibraryRoutes);
app.use("/api/document-data", documentDataRoutes);
app.use("/api/forms", formsRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/payment", paymentRoutes);

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

app.use((err, _req, res, _next) => {
  console.error("API Gateway Error:", err);
  const statusCode = Number.isInteger(err.status) && err.status >= 400 && err.status < 600
    ? err.status
    : 500;

  return res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? "Internal Server Error" : err.message,
  });
});

if (require.main === module) {
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`🚀 API Gateway running on port ${port}`);
  });

  const shutdown = (signal) => {
    console.log(`Received ${signal}. Shutting down API Gateway...`);
    server.close(() => process.exit(0));
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

module.exports = app;
