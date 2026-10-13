const mongoose = require("mongoose");

const documentLibrarySchema = new mongoose.Schema(
  {
    // The FebRocket user who owns this document library
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },

    // Person name
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // Normalized name used for finding an existing person
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    // Documents and extracted information belonging to this person
    documents: [
      {
        // Reference to the original Document
        documentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Document",
          required: true,
        },

        // File technical information
        // Stored here so form-filling can quickly check
        // whether an available document satisfies upload requirements.
        fileType: {
          type: String,
          required: true,
        },

        fileSize: {
          type: Number,
          required: true,
        },

        // AI-classified document type
        // Example: "Aadhaar Card", "PAN Card", "Marks Statement"
        documentType: {
          type: String,
          required: true,
        },

        // Structured data extracted from the document.
        // Used for person data and automatic form filling.
        data: {
          type: mongoose.Schema.Types.Mixed,
          default: {},
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// One person entry per user
documentLibrarySchema.index(
  { userId: 1, normalizedName: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "DocumentLibrary",
  documentLibrarySchema
);