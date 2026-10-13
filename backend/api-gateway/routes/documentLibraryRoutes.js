const express = require("express");
const { proxyRequest } = require("../helpers/proxy");

const router = express.Router();
const DOCUMENT_SERVICE_URL = process.env.DOCUMENT_SERVICE_URL || "http://localhost:3002";

router.use(async (req, res) => {
  return proxyRequest({
    req,
    res,
    serviceUrl: DOCUMENT_SERVICE_URL,
    serviceName: "DocumentLibrary",
  });
});

module.exports = router;
