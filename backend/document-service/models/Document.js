const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },

    fileName: {
      type: String,
      required: true,
    },

    displayName: {
      type: String,
      default: null,
    },

    storageKey: {
      type: String,
      required: true,
      unique: true,
    },

    // R2 Public Development URL
    publicUrl: {
      type: String,
      default: null,
    },

    fileType: {
      type: String,
      required: true,
    },

    fileSize: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["uploaded", "queued", "processing", "processed", "failed"],
      default: "uploaded",
    },

    processingError: {
      type: String,
      default: null,
    },

    processedAt: {
      type: Date,
      default: null,
    },

    // Clients use this persisted queue time to resume delayed status checks after refresh.
    processingRequestedAt: {
      type: Date,
      default: null,
    },

    // Structured extraction output and the metadata needed to reproduce it.
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    rawText: {
      type: String,
      default: null,
    },

    extractionMethod: {
      type: String,
      enum: ["ocr", "llm", "ocr+llm", "manual"],
      default: "ocr+llm",
    },

    processingVersion: {
      type: String,
      default: "1.0",
    },

    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

documentSchema.index({ userId: 1, createdAt: -1 });
documentSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Document", documentSchema);