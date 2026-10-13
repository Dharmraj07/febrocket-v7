const { pipeline } = require("node:stream/promises");
const Document = require("../models/Document");
const {
  isValidDocumentId,
  uploadDocument: createDocument,
  listDocuments,
  findUserDocument,
  getDocumentFile,
  deleteDocument: removeDocument,
} = require("../services/documentService");
const {
  enqueueDocumentProcessing,
  retryDocumentProcessing: retryQueuedDocument,
} = require("../services/documentQueue");
const documentEvents = require("../services/documentProcessingEvents");

const activeEventStreams = new Set();

const streamDocumentEvents = async (req, res) => {
  let unsubscribe;
  let heartbeat;
  let expiryTimeout;
  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(heartbeat);
    clearTimeout(expiryTimeout);
    activeEventStreams.delete(closeStream);
    await unsubscribe?.();
  };
  const closeStream = () => {
    void cleanup();
    if (!res.writableEnded) res.end();
  };

  try {
    unsubscribe = await documentEvents.subscribeToDocumentStatus((event) => {
      if (res.destroyed || res.writableEnded) return;
      if (req.user.role !== "admin" && String(event.userId) !== String(req.user.id)) return;
      res.write(`id: ${event.eventId}\nevent: document-status\ndata: ${JSON.stringify(event)}\n\n`);
    });

    res.status(200);
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write("retry: 3000\n: connected\n\n");
    heartbeat = setInterval(() => {
      if (!res.destroyed && !res.writableEnded) res.write(": keep-alive\n\n");
    }, 10000);
    heartbeat.unref?.();

    if (Number.isFinite(req.user.exp)) {
      const timeUntilExpiry = req.user.exp * 1000 - Date.now();
      expiryTimeout = setTimeout(closeStream, Math.max(0, timeUntilExpiry));
      expiryTimeout.unref?.();
    }

    activeEventStreams.add(closeStream);
    res.once("close", cleanup);
  } catch (error) {
    await unsubscribe?.();
    console.error("Could not open document processing event stream:", error.message);
    if (!res.headersSent) {
      return res.status(503).json({
        success: false,
        message: "Document processing updates are temporarily unavailable.",
      });
    }
    return closeStream();
  }
};

const closeDocumentEventStreams = () => {
  for (const closeStream of activeEventStreams) closeStream();
};
// ======================================================
// UPLOAD DOCUMENT
// ======================================================

const uploadDocument = async (req, res) => {
  let uploadedDocument;
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No document uploaded.",
      });
    }

    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    const userId = req.user.id;

    uploadedDocument = await createDocument({ userId, file: req.file });
    let document;
    try {
      document = await enqueueDocumentProcessing(uploadedDocument);
    } catch (error) {
      console.error("Document was stored but processing could not be queued:", error.message);
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
    console.error("❌ Upload Document Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to upload document.",
    });
  }
};
// const uploadDocument = async (req, res) => {
//   try {
//     // Validate uploaded file
//     if (!req.file) {
//       return res.status(400).json({
//         success: false,
//         message: "No document uploaded.",
//       });
//     }

//     // Validate authenticated user
//     if (!req.user?.id) {
//       return res.status(401).json({
//         success: false,
//         message: "Unauthorized.",
//       });
//     }

//     const userId = req.user.id;

//     const document = await createDocument({
//       userId,
//       file: req.file,
//     });

//     return res.status(201).json({
//       success: true,
//       message: "Document uploaded successfully.",
//       document,
//     });
//   } catch (error) {
//     console.error("❌ Upload Document Error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to upload document.",
//     });
//   }
// };

// ======================================================
// GET ALL USER DOCUMENTS
// ======================================================

const getDocuments = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const result = await listDocuments({ userId, page, limit });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("❌ Get Documents Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch documents.",
    });
  }
};

// ======================================================
// GET SINGLE DOCUMENT METADATA
// ======================================================

const getDocumentById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: documentId } = req.params;

    // Validate MongoDB ObjectId
    if (!isValidDocumentId(documentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID.",
      });
    }

    // Find document and verify ownership
    const document = await findUserDocument(documentId, userId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found.",
      });
    }

    return res.status(200).json({
      success: true,
      document,
    });
  } catch (error) {
    console.error("❌ Get Document Error:", error);

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
    const currentDocument = await findUserDocument(documentId, req.user.id);
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

    const document = await retryQueuedDocument({
      documentId,
      userId: req.user.id,
    });
    if (document) {
      return res.status(202).json({
        success: true,
        message: "Document queued for processing.",
        document,
      });
    }

    const latestDocument = await findUserDocument(documentId, req.user.id);
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
    console.error("Retry document processing failed:", error.message);
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
    const document = await Document.findOneAndUpdate(
      { _id: documentId, userId: req.user.id },
      { $set: { data: req.body.data } },
      { new: true, runValidators: true },
    ).lean();
    if (!document) {
      return res.status(404).json({ success: false, message: "Document not found." });
    }
    return res.status(200).json({ success: true, document });
  } catch (error) {
    console.error("Update extracted document information failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Could not save extracted information.",
    });
  }
};

// ======================================================
// PREVIEW DOCUMENT
// SUPPORTS IMAGES + PDF
// ======================================================

const previewDocument = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: documentId } = req.params;

    // Validate MongoDB ObjectId
    if (!isValidDocumentId(documentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID.",
      });
    }

    // Find document and verify ownership
    const document = await findUserDocument(documentId, userId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found.",
      });
    }

    // Check previewable file types
    const isImage = document.fileType?.startsWith("image/");
    const isPdf = document.fileType === "application/pdf";

    if (!isImage && !isPdf) {
      return res.status(415).json({
        success: false,
        message: "This file type cannot be previewed.",
      });
    }

    const fileResponse = await getDocumentFile(document.storageKey);

    // Set MIME type
    res.setHeader(
      "Content-Type",
      document.fileType || "application/octet-stream",
    );

    // Display inside browser
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(document.fileName)}"`,
    );

    // Private cache
    res.setHeader("Cache-Control", "private, max-age=3600");

    // Set file size if available
    if (document.fileSize) {
      res.setHeader("Content-Length", document.fileSize);
    }

    // Stream R2 → Browser
    await pipeline(fileResponse.Body, res);
  } catch (error) {
    console.error("❌ Preview Document Error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to preview document.",
      });
    }
  }
};

// ======================================================
// DOWNLOAD DOCUMENT
// SUPPORTS ALL FILE TYPES
// ======================================================

const downloadDocument = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: documentId } = req.params;

    // Validate MongoDB ObjectId
    if (!isValidDocumentId(documentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID.",
      });
    }

    // Find document and verify ownership
    const document = await findUserDocument(documentId, userId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found.",
      });
    }

    const fileResponse = await getDocumentFile(document.storageKey);

    // Set MIME type
    res.setHeader(
      "Content-Type",
      document.fileType || "application/octet-stream",
    );

    // Force browser download
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(document.fileName)}"`,
    );

    // Prevent sensitive documents from public caching
    res.setHeader("Cache-Control", "private, no-store");

    // Set file size
    if (document.fileSize) {
      res.setHeader("Content-Length", document.fileSize);
    }

    // Stream R2 → Browser
    await pipeline(fileResponse.Body, res);
  } catch (error) {
    console.error("❌ Download Document Error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to download document.",
      });
    }
  }
};

// ======================================================
// DELETE DOCUMENT
// ======================================================

const deleteDocument = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: documentId } = req.params;

    // Validate MongoDB ObjectId
    if (!isValidDocumentId(documentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID.",
      });
    }

    // Find document and verify ownership
    const document = await findUserDocument(documentId, userId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found.",
      });
    }

    const deleted = await removeDocument({
      documentId,
      userId,
      storageKey: document.storageKey,
    });
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
    console.error("❌ Delete Document Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete document.",
    });
  }
};

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
  uploadDocument,
  streamDocumentEvents,
  getDocuments,
  getDocumentById,
  retryDocumentProcessing,
  updateDocumentExtractedData,
  closeDocumentEventStreams,
  previewDocument,
  downloadDocument,
  deleteDocument,
};
