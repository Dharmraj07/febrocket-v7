require("dotenv").config();

const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const config = require("./config");
const documentRoutes = require("./routes/documentRoutes");
const documentDataRoutes = require("./routes/documentDataRoutes");
const documentLibraryRoutes = require("./routes/documentLibraryRoutes");
const internalProcessingRoutes = require("./routes/internalProcessingRoutes");
const formMappingRoutes = require("./routes/formMappingRoutes");

const app = express();

app.disable("x-powered-by");
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
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/internal/processing", internalProcessingRoutes);
app.use("/api/forms", formMappingRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/document-data", documentDataRoutes);
app.use("/api/document-library", documentLibraryRoutes);

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    service: "document-service",
    status: "ok",
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);

  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      message: "Malformed JSON request body.",
    });
  }

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      message: "File too large. Maximum size is 10MB.",
    });
  }

  if (err.code === "LIMIT_FILE_COUNT") {
    return res.status(400).json({
      success: false,
      message: "Too many files. Only 1 file is allowed.",
    });
  }

  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({
      success: false,
      message: "Unexpected field name. Use 'document' as the field name.",
    });
  }

  if (err.name === "MulterError") {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  const statusCode = err.status || err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

module.exports = app;
