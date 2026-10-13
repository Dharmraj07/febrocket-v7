const mongoose = require("mongoose");

const razorpayWebhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    eventType: { type: String, required: true },
    razorpayOrderId: { type: String, required: true },
    status: {
      type: String,
      enum: ["processing", "processed"],
      default: "processing",
      required: true,
    },
    processingStartedAt: { type: Date, default: Date.now },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.RazorpayWebhookEvent ||
  mongoose.model("RazorpayWebhookEvent", razorpayWebhookEventSchema);
