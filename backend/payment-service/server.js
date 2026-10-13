require("dotenv").config();

const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const config = require("./config");
const connectDB = require("./config/db");
const paymentRoutes = require("./routes/payment.routes");

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));
app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, !origin || config.allowedOrigins.includes(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
  })
);
app.use(cookieParser());
app.use(
  ["/api/payments/razorpay/webhook", "/api/payment/razorpay/webhook"],
  express.raw({ type: "application/json", limit: "1mb" })
);
app.use(express.json({ limit: "16kb" }));

app.use("/api/payments", paymentRoutes);
app.use("/api/payment", paymentRoutes);

app.get("/health", (_req, res) => {
  return res.status(200).json({
    success: true,
    service: "payment-service",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.use((error, _req, res, _next) => {
  console.error("Payment service error:", error.message);

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({
      success: false,
      message: "Malformed JSON request body.",
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error.",
  });
});

const startServer = async () => {
  await connectDB();
  const server = await new Promise((resolve, reject) => {
    const listeningServer = app.listen(config.port, "0.0.0.0", () => {
      console.log(`Payment Service listening on port ${config.port}`);
      resolve(listeningServer);
    });
    listeningServer.once("error", reject);
  });

  const shutdown = (signal) => {
    console.log(`Received ${signal}. Shutting down Payment Service...`);
    server.close((error) => {
      if (error) {
        console.error("Failed to close payment service:", error.message);
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
    console.error("Failed to start payment service:", error.name);
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };