const express = require("express");
const { proxyRequest } = require("../helpers/proxy");

const router = express.Router();
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || "http://localhost:3004";

router.use(async (req, res) => {
  return proxyRequest({
    req,
    res,
    serviceUrl: PAYMENT_SERVICE_URL,
    serviceName: "Payment",
  });
});

module.exports = router;
