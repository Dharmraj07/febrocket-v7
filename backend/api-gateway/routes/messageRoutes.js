const express = require("express");
const axios = require("axios");
const { proxyRequest } = require("../helpers/proxy");

const router = express.Router();

const MESSAGE_SERVICE_URL = process.env.MESSAGE_SERVICE_URL || "http://localhost:3003";
const MESSAGE_SERVICE_HEALTH = process.env.MESSAGE_SERVICE_HEALTH || `${MESSAGE_SERVICE_URL}/health`;
const HEALTH_CHECK_TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS || 30000);

router.get("/health", async (_req, res) => {
  try {
    const response = await axios.get(MESSAGE_SERVICE_HEALTH, {
      timeout: HEALTH_CHECK_TIMEOUT_MS,
      validateStatus: () => true,
    });
    return res.status(response.status).json({
      status: response.status >= 200 && response.status < 300 ? "ok" : "degraded",
      messageService: response.data,
    });
  } catch (error) {
    return res.status(503).json({
      status: "degraded",
      message: "Message service is unavailable",
    });
  }
});

router.use(async (req, res) => {
  return proxyRequest({
    req,
    res,
    serviceUrl: MESSAGE_SERVICE_URL,
    serviceName: "Message",
  });
});

module.exports = router;
