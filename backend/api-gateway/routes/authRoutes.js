const express = require("express");
const axios = require("axios");
const { proxyRequest } = require("../helpers/proxy");

const router = express.Router();

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || "http://localhost:3001";
const AUTH_SERVICE_HEALTH = process.env.AUTH_SERVICE_HEALTH || `${AUTH_SERVICE_URL}/health`;
const HEALTH_CHECK_TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS || 30000);

// 1. Keep the health check
router.get("/health", async (_req, res) => {
  try {
    const response = await axios.get(AUTH_SERVICE_HEALTH, {
      timeout: HEALTH_CHECK_TIMEOUT_MS,
      validateStatus: () => true,
    });
    return res.status(response.status).json({
      status: response.status >= 200 && response.status < 300 ? "ok" : "degraded",
      authService: response.data,
    });
  } catch (error) {
    return res.status(503).json({ status: "degraded", message: "Auth Service is unavailable" });
  }
});

// 2. Let the newly upgraded proxy helper handle EVERYTHING else!
// This will now safely handle email logins, /google, and /google/callback without crashing.
router.use(async (req, res) => {
  return proxyRequest({
    req,
    res,
    serviceUrl: AUTH_SERVICE_URL,
    serviceName: "Auth",
  });
});

module.exports = router;
