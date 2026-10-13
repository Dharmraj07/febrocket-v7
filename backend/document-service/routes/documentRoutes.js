const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  uploadToMemory,
  uploadToDisk,
} = require("../middleware/uploadMiddleware");

// ---------- USER CONTROLLERS ----------
const {
  uploadDocument,
  streamDocumentEvents,
  getDocuments,
  getDocumentById,
  previewDocument,
  downloadDocument,
  deleteDocument,
  retryDocumentProcessing,
  updateDocumentExtractedData,
} = require("../controllers/documentController");

// ---------- ADMIN CONTROLLERS ----------
const {
  getAllDocuments,
  getStats,
  adminUploadDocument,
  getDocumentById: adminGetDocumentById,
  previewDocument: adminPreviewDocument,
  downloadDocument: adminDownloadDocument,
  deleteDocument: adminDeleteDocument,
  retryDocumentProcessing: adminRetryDocumentProcessing,
  updateDocumentExtractedData: adminUpdateDocumentExtractedData,
} = require("../controllers/adminDocumentController");


// ======================================================
// UPLOAD TO MEMORY → CLOUDFLARE R2
// POST /api/documents/upload
// ======================================================

router.get("/events", authMiddleware(), streamDocumentEvents);

router.post(
  "/upload",
  authMiddleware(),
  uploadToMemory.single("document"),
  uploadDocument
);


// ======================================================
// UPLOAD TO LOCAL DISK
// POST /api/documents/upload/local
// ======================================================

router.post(
  "/upload/local",
  authMiddleware(),
  uploadToDisk.single("document"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No document uploaded.",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Document uploaded to local storage successfully.",

      file: {
        originalName: req.file.originalname,
        fileName: req.file.filename,
        path: req.file.path,
        mimetype: req.file.mimetype,
        size: req.file.size,
      },
    });
  }
);


// ======================================================
// ADMIN — STATS
// GET /api/documents/admin/stats
// ======================================================
// IMPORTANT: Static admin routes must come BEFORE "/:id"
// ======================================================

router.post(
  "/admin/:id/upload",
  authMiddleware({ adminOnly: true }),
  uploadToMemory.single("document"),
  adminUploadDocument
);

router.get(
  "/admin/stats",
  authMiddleware({ adminOnly: true }),
  getStats
);


// ======================================================
// ADMIN — LIST ALL DOCUMENTS
// GET /api/documents/admin/all
// Query: page, limit, userId, status, fileType, q, from, to
// ======================================================

router.get(
  "/admin/all",
  authMiddleware({ adminOnly: true }),
  getAllDocuments
);

router.post(
  "/admin/:id/retry",
  authMiddleware({ adminOnly: true }),
  adminRetryDocumentProcessing
);

router.put(
  "/admin/:id/data",
  authMiddleware({ adminOnly: true }),
  adminUpdateDocumentExtractedData
);


// ======================================================
// ADMIN — GET ONE DOCUMENT
// GET /api/documents/admin/:id
// ======================================================

router.get(
  "/admin/:id",
  authMiddleware({ adminOnly: true }),
  adminGetDocumentById
);


// ======================================================
// ADMIN — PREVIEW ANY DOCUMENT
// GET /api/documents/admin/:id/preview
// ======================================================

router.get(
  "/admin/:id/preview",
  authMiddleware({ adminOnly: true }),
  adminPreviewDocument
);


// ======================================================
// ADMIN — DOWNLOAD ANY DOCUMENT
// GET /api/documents/admin/:id/download
// ======================================================

router.get(
  "/admin/:id/download",
  authMiddleware({ adminOnly: true }),
  adminDownloadDocument
);


// ======================================================
// ADMIN — DELETE ANY DOCUMENT
// DELETE /api/documents/admin/:id
// ======================================================

router.delete(
  "/admin/:id",
  authMiddleware({ adminOnly: true }),
  adminDeleteDocument
);


// ======================================================
// GET ALL USER DOCUMENTS
// GET /api/documents
// ======================================================

router.get(
  "/",
  authMiddleware(),
  getDocuments
);

router.post(
  "/:id/retry",
  authMiddleware(),
  retryDocumentProcessing
);

router.put(
  "/:id/data",
  authMiddleware(),
  updateDocumentExtractedData
);


// ======================================================
// PREVIEW DOCUMENT (OWN)
// GET /api/documents/:id/preview
// ======================================================
// IMPORTANT: Must come BEFORE "/:id"
// ======================================================

router.get(
  "/:id/preview",
  authMiddleware(),
  previewDocument
);


// ======================================================
// DOWNLOAD DOCUMENT (OWN)
// GET /api/documents/:id/download
// ======================================================
// IMPORTANT: Must come BEFORE "/:id"
// ======================================================

router.get(
  "/:id/download",
  authMiddleware(),
  downloadDocument
);


// ======================================================
// GET SINGLE DOCUMENT METADATA (OWN)
// GET /api/documents/:id
// ======================================================

router.get(
  "/:id",
  authMiddleware(),
  getDocumentById
);


// ======================================================
// DELETE DOCUMENT (OWN)
// DELETE /api/documents/:id
// ======================================================

router.delete(
  "/:id",
  authMiddleware(),
  deleteDocument
);

module.exports = router;

// ======================================================
// EXPORT
// ======================================================

module.exports = router;