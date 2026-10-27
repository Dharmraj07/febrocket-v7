const mongoose = require("mongoose");

const Document = require("../models/Document");
const DocumentLibrary = require("../models/DocumentLibrary");

const allowedExtractionMethods = ["ocr", "llm", "ocr+llm", "manual"];

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const parsePagination = (req) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  return { page, limit };
};

const buildPagination = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
  hasNextPage: page * limit < total,
  hasPrevPage: page > 1,
});

// Keep the legacy data-route contract while the data now lives on Document.
const formatDocumentData = (document) => {
  if (!document) return document;
  return {
    ...document,
    documentId: {
      _id: document._id,
      fileName: document.fileName,
      displayName: document.displayName,
      fileType: document.fileType,
      status: document.status,
      createdAt: document.createdAt,
    },
  };
};

const formatRecords = (documents) => documents.map(formatDocumentData);

const sanitizeUpdatePayload = (payload = {}) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Request body must be a JSON object.");
  }

  const update = {};

  if (Object.prototype.hasOwnProperty.call(payload, "data")) {
    if (payload.data === null || typeof payload.data !== "object" || Array.isArray(payload.data)) {
      throw new Error("Field 'data' must be a JSON object.");
    }
    update.data = payload.data;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "rawText")) {
    if (payload.rawText !== null && typeof payload.rawText !== "string") {
      throw new Error("Field 'rawText' must be a string or null.");
    }
    update.rawText = payload.rawText;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "extractionMethod")) {
    if (!allowedExtractionMethods.includes(payload.extractionMethod)) {
      throw new Error(
        `Field 'extractionMethod' must be one of: ${allowedExtractionMethods.join(", ")}.`
      );
    }
    update.extractionMethod = payload.extractionMethod;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "processingVersion")) {
    if (typeof payload.processingVersion !== "string" || !payload.processingVersion.trim()) {
      throw new Error("Field 'processingVersion' must be a non-empty string.");
    }
    update.processingVersion = payload.processingVersion.trim();
  }

  if (Object.prototype.hasOwnProperty.call(payload, "confidence")) {
    const confidence = Number(payload.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error("Field 'confidence' must be a number between 0 and 1.");
    }
    update.confidence = confidence;
  }

  if (Object.keys(update).length === 0) {
    throw new Error("No valid document data fields were provided for update.");
  }

  return update;
};

const getUserDocumentData = async (req, res) => {
  try {
    const userId = req.workspaceOwnerId || req.user.id;
    const { page, limit } = parsePagination(req);
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      Document.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Document.countDocuments({ userId }),
    ]);

    return res.status(200).json({
      success: true,
      data: formatRecords(records),
      pagination: buildPagination(page, limit, total),
    });
  } catch (error) {
    console.error("Get user document data error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch your document data.",
    });
  }
};

const getUserDocumentDataById = async (req, res) => {
  try {
    const { documentId } = req.params;

    if (!isValidObjectId(documentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid documentId.",
      });
    }

    const record = await Document.findOne({
      _id: documentId,
      userId: req.workspaceOwnerId || req.user.id,
    }).lean();

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Document data not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: formatDocumentData(record),
    });
  } catch (error) {
    console.error("Get user document data by id error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch document data.",
    });
  }
};

const updateUserDocumentData = async (req, res) => {
  try {
    const { documentId } = req.params;

    if (!isValidObjectId(documentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid documentId.",
      });
    }

    const record = await Document.findOne({
      _id: documentId,
      userId: req.workspaceOwnerId || req.user.id,
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Document data not found.",
      });
    }

    const update = sanitizeUpdatePayload(req.body);
    Object.assign(record, update);
    await record.save();

    if (update.data) {
      await DocumentLibrary.updateMany(
        {
          userId: req.workspaceOwnerId || req.user.id,
          "documents.documentId": documentId,
        },
        { $set: { "documents.$.data": update.data } }
      ).catch((err) => {
        console.warn("Could not sync updated document data to library:", err.message);
      });
    }

    return res.status(200).json({
      success: true,
      message: "Document data updated successfully.",
      data: formatDocumentData(record.toObject()),
    });
  } catch (error) {
    console.error("Update user document data error:", error);

    if (error.message.startsWith("Field ") || error.message.includes("must be")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update document data.",
    });
  }
};

const deleteUserDocumentData = async (req, res) => {
  try {
    const { documentId } = req.params;

    if (!isValidObjectId(documentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid documentId.",
      });
    }

    const record = await Document.findOne({
      _id: documentId,
      userId: req.user.id,
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Document data not found.",
      });
    }

    record.data = {};
    record.rawText = null;
    record.confidence = null;
    await record.save();

    await DocumentLibrary.updateMany(
      { userId: req.user.id, "documents.documentId": documentId },
      { $set: { "documents.$.data": {} } }
    ).catch((err) => {
      console.warn("Could not sync cleared document data to library:", err.message);
    });

    return res.status(200).json({
      success: true,
      message: "Document data deleted successfully.",
    });
  } catch (error) {
    console.error("Delete user document data error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete document data.",
    });
  }
};

const getAllDocumentData = async (req, res) => {
  try {
    const { page, limit } = parsePagination(req);
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.query.userId) {
      if (!isValidObjectId(req.query.userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid userId.",
        });
      }
      filter.userId = req.query.userId;
    }

    if (req.query.documentId) {
      if (!isValidObjectId(req.query.documentId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid documentId.",
        });
      }
      filter._id = req.query.documentId;
    }

    const [records, total] = await Promise.all([
      Document.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "_id name email")
        .lean(),
      Document.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: formatRecords(records),
      pagination: buildPagination(page, limit, total),
    });
  } catch (error) {
    console.error("Admin list document data error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch document data.",
    });
  }
};

const getDocumentDataForUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId.",
      });
    }

    const records = await Document.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      userId,
      data: formatRecords(records),
    });
  } catch (error) {
    console.error("Admin fetch user document data error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user document data.",
    });
  }
};

const getDocumentDataByIdAdmin = async (req, res) => {
  try {
    const { documentId } = req.params;

    if (!isValidObjectId(documentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid documentId.",
      });
    }

    const record = await Document.findOne({ _id: documentId })
      .populate("userId", "_id name email")
      .lean();

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Document data not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: formatDocumentData(record),
    });
  } catch (error) {
    console.error("Admin get document data error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch document data.",
    });
  }
};

const updateDocumentDataByIdAdmin = async (req, res) => {
  try {
    const { documentId } = req.params;

    if (!isValidObjectId(documentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid documentId.",
      });
    }

    const record = await Document.findOne({ _id: documentId });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Document data not found.",
      });
    }

    const update = sanitizeUpdatePayload(req.body);
    Object.assign(record, update);
    await record.save();

    return res.status(200).json({
      success: true,
      message: "Document data updated successfully.",
      data: formatDocumentData(record.toObject()),
    });
  } catch (error) {
    console.error("Admin update document data error:", error);

    if (error.message.startsWith("Field ") || error.message.includes("must be")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update document data.",
    });
  }
};

const deleteDocumentDataByIdAdmin = async (req, res) => {
  try {
    const { documentId } = req.params;

    if (!isValidObjectId(documentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid documentId.",
      });
    }

    const record = await Document.findOne({ _id: documentId });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Document data not found.",
      });
    }

    record.data = {};
    record.rawText = null;
    record.confidence = null;
    await record.save();

    return res.status(200).json({
      success: true,
      message: "Document data deleted successfully.",
    });
  } catch (error) {
    console.error("Admin delete document data error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete document data.",
    });
  }
};

module.exports = {
  isValidObjectId,
  getUserDocumentData,
  getUserDocumentDataById,
  updateUserDocumentData,
  deleteUserDocumentData,
  getAllDocumentData,
  getDocumentDataForUser,
  getDocumentDataByIdAdmin,
  updateDocumentDataByIdAdmin,
  deleteDocumentDataByIdAdmin,
};
