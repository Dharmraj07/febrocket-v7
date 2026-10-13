const express = require("express");
const { proxyRequest } = require("../helpers/proxy");

const router = express.Router();
const DOCUMENT_SERVICE_URL = process.env.DOCUMENT_SERVICE_URL || "http://localhost:3002";

for (const path of ["/session", "/analyze", "/context", "/map", "/resolve", "/feedback"]) {
  router.post(path, async (req, res) => proxyRequest({
    req,
    res,
    serviceUrl: DOCUMENT_SERVICE_URL,
    serviceName: "Document",
  }));
}

router.use((_req, res) => res.status(404).json({
  success: false,
  message: "Route not found.",
}));

module.exports = router;
