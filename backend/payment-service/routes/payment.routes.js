const express = require("express");
const requireAuth = require("../middleware/auth.middleware");
const {
  createPaymentOrder,
  verifyPayment,
  handleRazorpayWebhook,
} = require("../controllers/payment.controller");

const router = express.Router();

router.post("/create-order", requireAuth(), createPaymentOrder);
router.post("/verify-payment", requireAuth(), verifyPayment);
router.post("/razorpay/webhook", handleRazorpayWebhook);

module.exports = router;