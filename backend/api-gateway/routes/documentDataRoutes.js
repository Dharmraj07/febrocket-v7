const express = require("express");
const axios = require("axios");
const { proxyRequest } = require("../helpers/proxy");

const router = express.Router();

const DOCUMENT_SERVICE_URL = process.env.DOCUMENT_SERVICE_URL || "http://localhost:3002";
const DOCUMENT_SERVICE_HEALTH = process.env.DOCUMENT_SERVICE_HEALTH || `${DOCUMENT_SERVICE_URL || "http://localhost:3002"}/health`;
const HEALTH_CHECK_TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS || 30000);

router.get("/health", async (_req, res) => {
  try {
    const response = await axios.get(DOCUMENT_SERVICE_HEALTH, {
      timeout: HEALTH_CHECK_TIMEOUT_MS,
      validateStatus: () => true,
    });
    return res.status(response.status).json({
      status: response.status >= 200 && response.status < 300 ? "ok" : "degraded",
      documentService: response.data,
    });
  } catch (error) {
    console.error("Document Data Service Health Check Error:", error.message);
    return res.status(503).json({
      status: "degraded",
      message: "Document Data Service is unavailable",
    });
  }
});

router.use(async (req, res) => {
  return proxyRequest({
    req,
    res,
    serviceUrl: DOCUMENT_SERVICE_URL,
    serviceName: "DocumentData",
  });
});

module.exports = router;
