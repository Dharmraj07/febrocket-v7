const axios = require("axios");
const { pipeline } = require("node:stream/promises");
const { getEnvNumber } = require("../helpers/env");
const {
  uploadDocument: createDocument,
  deleteDocument: removeDocument,
} = require("../services/documentService");
const { enqueueDocumentProcessing } = require("../services/documentQueue");
const {
  isValidDocumentId,
  listAllDocuments,
  findDocumentById,
  getDocumentStats,
  adminDeleteDocument,
  getDocumentFile,
} = require("../services/adminDocumentService");
const { retryDocumentProcessing: retryQueuedDocument } = require("../services/documentQueue");
const Document = require("../models/Document");

const authServiceUrl = (
  process.env.AUTH_SERVICE_URL || "http://localhost:3001"
).replace(/\/+$/, "");
const authServiceTimeoutMs = Math.max(
  1000,
  getEnvNumber("AUTH_SERVICE_TIMEOUT_MS", 5000),
);

const verifyTargetUser = async (userId, req) => {
  try {
    const response = await axios.get(
      `${authServiceUrl}/api/auth/admin/users/${encodeURIComponent(userId)}`,
      {
        headers: {
          ...(req.headers.authorization
            ? { authorization: req.headers.authorization }
            : {}),
          ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
        },
        timeout: authServiceTimeoutMs,
      },
    );

    if (response.data?.success && response.data.user) return true;
    return false;
  } catch (error) {
    if (error.response?.status === 404) return false;
    if (error.response?.status === 401 || error.response?.status === 403) {
      const authorizationError = new Error(
        error.response.status === 401
          ? "Authentication is no longer valid."
          : "Admin privileges are required.",
      );
      authorizationError.status = error.response.status;
      throw authorizationError;
    }

    if (error.response) {
      const verificationError = new Error("Target user verification failed.");
      verificationError.status = 502;
      throw verificationError;
    }

    const verificationError = new Error("User service is unavailable.");
    verificationError.status = 503;
    throw verificationError;
  }
};

const adminUploadDocument = async (req, res) => {
  const { id: userId } = req.params;
  if (!isValidDocumentId(userId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid user ID.",
    });
  }

  if (!req.file || !Buffer.isBuffer(req.file.buffer) || req.file.buffer.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No document uploaded.",
    });
  }

  let uploadedDocument;
  try {
    const userExists = await verifyTargetUser(userId, req);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    uploadedDocument = await createDocument({ userId, file: req.file });
    let document;
    try {
      document = await enqueueDocumentProcessing(uploadedDocument);
    } catch (error) {
      console.error("Admin document was stored but processing could not be queued:", error.message);
      document = await Document.findById(uploadedDocument._id).lean() || uploadedDocument;
      return res.status(201).json({
        success: true,
        message: "Document uploaded successfully. Processing could not be queued; please retry processing.",
        document,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Document uploaded successfully and queued for processing.",
      document,
    });
  } catch (error) {
    console.error("❌ Admin Upload Document Error:", error);

    const statusCode =
      Number.isInteger(error.status) && error.status >= 400 && error.status < 600
        ? error.status
        : 500;
    return res.status(statusCode).json({
      success: false,
      message:
        statusCode === 500
          ? "Failed to upload document."
          : error.message,
    });
  }
};

/* =====================================================
   GET /api/admin/documents
   Query: page, limit, userId, status, fileType, q, from, to
   ===================================================== */

const getAllDocuments = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const result = await listAllDocuments({
      page,
      limit,
      userId: req.query.userId,
      status: req.query.status,
      fileType: req.query.fileType,
      q: req.query.q,
      from: req.query.from,
      to: req.query.to,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("❌ Admin Get All Documents Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch documents.",
    });
  }
};

/* =====================================================
   GET /api/admin/documents/stats
   ===================================================== */

const getStats = async (req, res) => {
  try {
    const stats = await getDocumentStats();
    return res.status(200).json({ success: true, stats });
  } catch (error) {
    console.error("❌ Admin Get Document Stats Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch document stats.",
    });
  }
};

/* =====================================================
   GET /api/admin/documents/:id
   ===================================================== */

const getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidDocumentId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID.",
      });
    }

    const document = await findDocumentById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found.",
      });
    }

    return res.status(200).json({ success: true, document });
  } catch (error) {
    console.error("❌ Admin Get Document Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch document.",
    });
  }
};

const retryDocumentProcessing = async (req, res) => {
  const { id: documentId } = req.params;
  if (!isValidDocumentId(documentId)) {
    return res.status(400).json({ success: false, message: "Invalid document ID." });
  }

  try {
    const currentDocument = await Document.findById(documentId).select("status").lean();
    if (!currentDocument) {
      return res.status(404).json({ success: false, message: "Document not found." });
    }
    if (!["uploaded", "failed"].includes(currentDocument.status)) {
      return res.status(409).json({
        success: false,
        message: ["queued", "processing"].includes(currentDocument.status)
          ? "This document is already being processed."
          : "This document cannot be retried in its current state.",
      });
    }

    const document = await retryQueuedDocument({ documentId });
    if (document) {
      return res.status(202).json({
        success: true,
        message: "Document queued for processing.",
        document,
      });
    }

    const latestDocument = await Document.findById(documentId).select("status").lean();
    if (!latestDocument) {
      return res.status(404).json({ success: false, message: "Document not found." });
    }
    return res.status(409).json({
      success: false,
      message: ["queued", "processing"].includes(latestDocument.status)
        ? "This document is already being processed."
        : "This document cannot be retried in its current state.",
    });
  } catch (error) {
    console.error("Admin retry document processing failed:", error.message);
    return res.status(error.status || 503).json({
      success: false,
      message: "Document processing is temporarily unavailable.",
    });
  }
};

const updateDocumentExtractedData = async (req, res) => {
  const { id: documentId } = req.params;
  if (!isValidDocumentId(documentId)) {
    return res.status(400).json({ success: false, message: "Invalid document ID." });
  }
  if (
    !req.body ||
    typeof req.body !== "object" ||
    Array.isArray(req.body) ||
    !req.body.data ||
    typeof req.body.data !== "object" ||
    Array.isArray(req.body.data)
  ) {
    return res.status(400).json({
      success: false,
      message: "Extracted information must be a JSON object.",
    });
  }

  try {
    const document = await Document.findByIdAndUpdate(
      documentId,
      { $set: { data: req.body.data } },
      { new: true, runValidators: true },
    ).lean();
    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found." });
    }
    return res.status(200).json({ success: true, document });
  } catch (error) {
    console.error("Admin update extracted document information failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Could not save extracted information.",
    });
  }
};

/* =====================================================
   GET /api/admin/documents/:id/preview
   ===================================================== */

const previewDocument = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidDocumentId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID.",
      });
    }

    const document = await findDocumentById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found.",
      });
    }

    const isImage = document.fileType?.startsWith("image/");
    const isPdf = document.fileType === "application/pdf";

    if (!isImage && !isPdf) {
      return res.status(415).json({
        success: false,
        message: "This file type cannot be previewed.",
      });
    }

    const fileResponse = await getDocumentFile(document.storageKey);

    res.setHeader(
      "Content-Type",
      document.fileType || "application/octet-stream"
    );
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(document.fileName)}"`
    );
    res.setHeader("Cache-Control", "private, max-age=3600");
    if (document.fileSize) {
      res.setHeader("Content-Length", document.fileSize);
    }

    await pipeline(fileResponse.Body, res);
  } catch (error) {
    console.error("❌ Admin Preview Document Error:", error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to preview document.",
      });
    }
  }
};

/* =====================================================
   GET /api/admin/documents/:id/download
   ===================================================== */

const downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidDocumentId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID.",
      });
    }

    const document = await findDocumentById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found.",
      });
    }

    const fileResponse = await getDocumentFile(document.storageKey);

    res.setHeader(
      "Content-Type",
      document.fileType || "application/octet-stream"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(document.fileName)}"`
    );
    res.setHeader("Cache-Control", "private, no-store");
    if (document.fileSize) {
      res.setHeader("Content-Length", document.fileSize);
    }

    await pipeline(fileResponse.Body, res);
  } catch (error) {
    console.error("❌ Admin Download Document Error:", error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to download document.",
      });
    }
  }
};

/* =====================================================
   DELETE /api/admin/documents/:id
   ===================================================== */

const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidDocumentId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID.",
      });
    }

    const deleted = await adminDeleteDocument({ documentId: id });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Document not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Document deleted successfully.",
    });
  } catch (error) {
    console.error("❌ Admin Delete Document Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete document.",
    });
  }
};

module.exports = {
  adminUploadDocument,
  getAllDocuments,
  getStats,
  getDocumentById,
  retryDocumentProcessing,
  updateDocumentExtractedData,
  previewDocument,
  downloadDocument,
  deleteDocument,
};