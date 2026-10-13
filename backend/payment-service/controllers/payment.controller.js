const mongoose = require("mongoose");
const {
  createOrder,
  validateOrderRequest,
  verifyPaymentSignature,
  verifyWebhookSignature,
} = require("../services/razorpay.service");
const config = require("../config");
const Payment = require("../models/Payment");
const RazorpayWebhookEvent = require("../models/RazorpayWebhookEvent");

const createPaymentOrder = async (req, res) => {
  try {
    validateOrderRequest(req.body);
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
    });
  }

  try {
    const userId = req.user?.id || null;
    const orderPayload = {
      ...req.body,
      notes: { ...(req.body.notes || {}), ...(userId ? { userId: String(userId) } : {}) },
    };
    const order = await createOrder(orderPayload);
    if (order?.id && mongoose.connection?.readyState === 1) {
      await Payment.findOneAndUpdate(
        { razorpayOrderId: order.id },
        {
          $setOnInsert: {
            userId,
            razorpayOrderId: order.id,
            amount: order.amount,
            currency: order.currency || "INR",
            status: "created",
            lastWebhookEvent: "order.created",
          },
        },
        { upsert: true }
      ).catch((err) => console.warn("Could not record payment order:", err.message));
    }
    return res.status(201).json({ success: true, ...order });
  } catch (error) {
    console.error("Razorpay order creation failed:", error.name);
    const statusCode =
      error.statusCode === 401 || error.statusCode === 403
        ? 401
        : error.statusCode === 503
          ? 503
          : 500;
    return res.status(statusCode).json({
      success: false,
      message:
        statusCode === 401
          ? "Razorpay authentication failed."
          : statusCode === 503
            ? "Payment service is not configured."
            : "Unable to create payment order.",
    });
  }
};

const verifyPayment = (req, res) => {
  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  } = req.body || {};

  if (
    typeof orderId !== "string" ||
    !orderId.trim() ||
    typeof paymentId !== "string" ||
    !paymentId.trim() ||
    typeof signature !== "string" ||
    !signature.trim()
  ) {
    return res.status(400).json({
      success: false,
      message: "razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.",
    });
  }

  if (!verifyPaymentSignature(req.body)) {
    return res.status(400).json({
      success: false,
      message: "Payment signature verification failed.",
    });
  }

  const userId = req.user?.id || null;
  if (mongoose.connection?.readyState === 1) {
    void Payment.findOneAndUpdate(
      { razorpayOrderId: orderId },
      {
        $set: {
          razorpayPaymentId: paymentId,
          status: "paid",
          ...(userId ? { userId } : {}),
        },
      },
      { returnDocument: "after" }
    ).catch((err) => console.warn("Could not update payment on verify:", err.message));
  }

  return res.status(200).json({
    success: true,
    message: "Payment signature verified.",
    order_id: orderId,
    payment_id: paymentId,
  });
};

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const processWebhookPayment = async ({
  orderId,
  paymentId,
  status,
  amount,
  currency,
  eventType,
  userId,
}) => {
  await Payment.findOneAndUpdate(
    { razorpayOrderId: orderId },
    [
      {
        $set: {
          razorpayOrderId: { $literal: orderId },
          razorpayPaymentId: paymentId
            ? { $literal: paymentId }
            : { $ifNull: ["$razorpayPaymentId", null] },
          status: {
            $cond: [{ $eq: ["$status", "paid"] }, "paid", { $literal: status }],
          },
          amount: { $literal: amount },
          currency: { $literal: currency },
          lastWebhookEvent: { $literal: eventType },
          ...(userId ? { userId: { $literal: userId } } : {}),
        },
      },
    ],
    { upsert: true, new: true }
  );
};

const handleRazorpayWebhook = async (req, res) => {
  if (!config.razorpayWebhookSecret) {
    console.error("Razorpay webhook secret is not configured.");
    return res.status(503).json({
      success: false,
      message: "Webhook endpoint is not configured.",
    });
  }

  const signature = req.get("x-razorpay-signature");
  if (!verifyWebhookSignature(req.body, signature)) {
    console.warn("Rejected Razorpay webhook with an invalid signature.");
    return res.status(400).json({
      success: false,
      message: "Invalid webhook signature.",
    });
  }

  let webhook;
  try {
    webhook = JSON.parse(req.body.toString("utf8"));
  } catch {
    console.warn("Rejected malformed Razorpay webhook JSON.");
    return res.status(400).json({
      success: false,
      message: "Malformed webhook body.",
    });
  }

  const { event: eventType } = webhook || {};
  if (!isNonEmptyString(eventType)) {
    console.warn("Rejected Razorpay webhook with missing required fields.");
    return res.status(400).json({
      success: false,
      message: "Missing required webhook field: event.",
    });
  }

  const supportedEvents = new Set([
    "payment.captured",
    "payment.failed",
    "order.paid",
  ]);
  if (!supportedEvents.has(eventType)) {
    console.warn("Ignoring unknown Razorpay webhook event.");
    return res.status(200).json({ success: true, received: true });
  }

  const payload =
    webhook?.payload && typeof webhook.payload === "object"
      ? webhook.payload
      : {};
  const eventId = req.get("x-razorpay-event-id");
  const payment = payload.payment?.entity;
  const order = payload.order?.entity;
  const orderId =
    eventType === "order.paid"
      ? order?.id
      : payment?.order_id;
  const paymentId = payment?.id || order?.payment_id || null;
  const amount = payment?.amount ?? order?.amount;
  const currency = payment?.currency ?? order?.currency;
  const missingFields = [];

  if (!isNonEmptyString(eventId)) missingFields.push("x-razorpay-event-id");
  if (!isNonEmptyString(orderId)) missingFields.push("order id");
  if (eventType !== "order.paid" && !isNonEmptyString(paymentId)) {
    missingFields.push("payment id");
  }
  if (!Number.isSafeInteger(amount) || amount < 0) missingFields.push("amount");
  if (!isNonEmptyString(currency)) missingFields.push("currency");

  if (missingFields.length) {
    console.warn("Rejected Razorpay webhook with missing required fields.");
    return res.status(400).json({
      success: false,
      message: `Missing required webhook fields: ${missingFields.join(", ")}.`,
    });
  }

  try {
    let webhookEvent;
    try {
      webhookEvent = await RazorpayWebhookEvent.create({
        eventId,
        eventType,
        razorpayOrderId: orderId,
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      webhookEvent = await RazorpayWebhookEvent.findOne({ eventId });
      if (!webhookEvent) throw error;
      if (
        webhookEvent.eventType !== eventType ||
        webhookEvent.razorpayOrderId !== orderId
      ) {
        console.warn("Rejected Razorpay webhook event ID with conflicting details.");
        return res.status(409).json({
          success: false,
          message: "Conflicting webhook event ID.",
        });
      }
      if (webhookEvent.status === "processed") {
        return res.status(200).json({
          success: true,
          received: true,
          duplicate: true,
        });
      }

      const leaseExpiresAt =
        new Date(webhookEvent.processingStartedAt || 0).getTime() + 120_000;
      if (
        webhookEvent.status === "processing" &&
        leaseExpiresAt > Date.now()
      ) {
        res.set("Retry-After", "30");
        return res.status(503).json({
          success: false,
          message: "Webhook event is already being processed.",
        });
      }

      const previousProcessingStartedAt = webhookEvent.processingStartedAt;
      webhookEvent = await RazorpayWebhookEvent.findOneAndUpdate(
        {
          eventId,
          status: webhookEvent.status,
          processingStartedAt: previousProcessingStartedAt,
        },
        { $set: { status: "processing", processingStartedAt: new Date() } },
        { new: true }
      );
      if (!webhookEvent) {
        res.set("Retry-After", "30");
        return res.status(503).json({
          success: false,
          message: "Webhook event is already being processed.",
        });
      }
    }

    const webhookUserId = order?.notes?.userId || payment?.notes?.userId || null;
    await processWebhookPayment({
      orderId,
      paymentId,
      status: eventType === "payment.failed" ? "failed" : "paid",
      amount,
      currency,
      eventType,
      userId: webhookUserId,
    });
    webhookEvent.status = "processed";
    webhookEvent.processingStartedAt = null;
    webhookEvent.processedAt = new Date();
    await webhookEvent.save();

    return res.status(200).json({ success: true, received: true });
  } catch (error) {
    console.error("Razorpay webhook database update failed:", error.name);
    return res.status(500).json({
      success: false,
      message: "Unable to process webhook.",
    });
  }
};

module.exports = {
  createPaymentOrder,
  verifyPayment,
  handleRazorpayWebhook,
};