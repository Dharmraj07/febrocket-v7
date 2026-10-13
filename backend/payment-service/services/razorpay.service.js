const crypto = require("node:crypto");
const Razorpay = require("razorpay");
const config = require("../config");

let razorpayClient;

const createPaymentError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const validateOrderRequest = (request = {}) => {
  const { amount, currency = "INR" } = request || {};
  if (!Number.isSafeInteger(amount) || amount < 100) {
    throw createPaymentError("Amount must be an integer of at least 100 paise.", 400);
  }

  if (currency !== "INR") {
    throw createPaymentError("Only INR payments are supported.", 400);
  }
};

const getRazorpayClient = () => {
  if (!config.razorpayKeyId || !config.razorpayKeySecret) {
    throw createPaymentError("Razorpay credentials are not configured.", 503);
  }

  razorpayClient ??= new Razorpay({
    key_id: config.razorpayKeyId,
    key_secret: config.razorpayKeySecret,
  });
  return razorpayClient;
};

const createOrder = async ({ amount, currency = "INR" }) => {
  validateOrderRequest({ amount, currency });
  const razorpay = getRazorpayClient();
  const order = await razorpay.orders.create({
    amount,
    currency,
    receipt: `fr_${crypto.randomUUID().replaceAll("-", "")}`,
  });

  return {
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    key_id: config.razorpayKeyId,
  };
};

const verifyPaymentSignature = (payment = {}) => {
  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  } = payment || {};
  if (
    typeof orderId !== "string" ||
    !orderId.trim() ||
    typeof paymentId !== "string" ||
    !paymentId.trim() ||
    typeof signature !== "string" ||
    !/^[\da-f]{64}$/i.test(signature) ||
    !config.razorpayKeySecret
  ) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", config.razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest();
  const received = Buffer.from(signature, "hex");

  return received.length === expected.length && crypto.timingSafeEqual(expected, received);
};

const verifyWebhookSignature = (rawBody, signature) => {
  if (
    !Buffer.isBuffer(rawBody) ||
    typeof signature !== "string" ||
    !/^[\da-f]{64}$/i.test(signature) ||
    !config.razorpayWebhookSecret
  ) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", config.razorpayWebhookSecret)
    .update(rawBody)
    .digest();
  const received = Buffer.from(signature, "hex");

  return received.length === expected.length && crypto.timingSafeEqual(expected, received);
};

module.exports = {
  createOrder,
  validateOrderRequest,
  verifyPaymentSignature,
  verifyWebhookSignature,
};