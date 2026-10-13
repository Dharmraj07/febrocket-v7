const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    userId: { type: String, default: null, index: true },
    razorpayOrderId: { type: String, required: true, unique: true },
    razorpayPaymentId: { type: String, default: null, index: true },
    status: { type: String, enum: ["created", "paid", "failed"], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    lastWebhookEvent: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
