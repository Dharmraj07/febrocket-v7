const mongoose = require("mongoose");
const Document = require("../models/Document");
const documentLibraryService = require("../services/documentLibraryService");
const r2Service = require("../services/r2Service");
const documentProcessingEvents = require("../services/documentProcessingEvents");

const SAFE_PROCESSING_ERROR = "Unable to process this document. Please try again.";
const REQUEST_ID_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function getRequestDate(requestId) {
  if (typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId)) return null;
  const date = new Date(requestId);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validateIdentity(documentId, requestId) {
  return mongoose.Types.ObjectId.isValid(documentId) && getRequestDate(requestId);
}

async function getProcessingSource(req, res) {
  const { id: documentId } = req.params;
  const requestDate = getRequestDate(req.query.requestId);
  if (!mongoose.Types.ObjectId.isValid(documentId) || !requestDate) {
    return res.status(400).json({
      success: false,
      message: "Invalid processing request.",
    });
  }

  try {
    const document = await Document.findOneAndUpdate(
      {
        _id: documentId,
        processingRequestedAt: requestDate,
        status: { $in: ["queued", "processing"] },
      },
      { $set: { status: "processing", processingError: null } },
      { new: true },
    )
      .select("fileName fileType storageKey")
      .lean();

    if (!document) {
      const existing = await Document.findById(documentId)
        .select("status processingRequestedAt")
        .lean();
      if (!existing) {
        return res.status(404).json({ success: false, message: "Document not found." });
      }
      if (
        existing.status === "processed" &&
        existing.processingRequestedAt?.getTime() === requestDate.getTime()
      ) {
        return res.status(200).json({ success: true, alreadyProcessed: true });
      }
      return res.status(200).json({ success: true, ignored: true });
    }

    const signedUrl = await r2Service.getSignedFileUrl(document.storageKey, 300);
    return res.status(200).json({
      success: true,
      document: {
        documentId,
        fileName: document.fileName,
        fileType: document.fileType,
        signedUrl,
      },
    });
  } catch (error) {
    console.error("Failed to provide document source to processing service:", error.message);
    return res.status(503).json({
      success: false,
      message: "Document source is temporarily unavailable.",
    });
  }
}

async function receiveProcessingResult(req, res) {
  const { documentId, requestId, event } = req.body || {};
  const requestDate = validateIdentity(documentId, requestId);
  if (!requestDate || !["retrying", "completed", "failed"].includes(event)) {
    return res.status(400).json({
      success: false,
      message: "Invalid processing result.",
    });
  }

  if (
    event === "completed" &&
    (!req.body.data || typeof req.body.data !== "object" || Array.isArray(req.body.data) ||
      typeof req.body.displayName !== "string")
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid processing result data.",
    });
  }

  try {
    let update;
    if (event === "retrying") {
      update = {
        $set: {
          status: "queued",
          processingError: SAFE_PROCESSING_ERROR,
        },
      };
    } else if (event === "failed") {
      update = {
        $set: {
          status: "failed",
          processingError: SAFE_PROCESSING_ERROR,
        },
      };
    } else {
      const data = { ...req.body.data };
      if (documentLibraryService.getPersonNames(data).length === 0) {
        data.libraryCategory = "Uncategorized";
      }
      update = {
        $set: {
          data,
          displayName: req.body.displayName,
          extractionMethod: "llm",
          processingVersion: "1.0",
          status: "processed",
          processedAt: new Date(),
          processingError: null,
        },
      };
    }

    const document = await Document.findOneAndUpdate(
      {
        _id: documentId,
        processingRequestedAt: requestDate,
        status: { $in: ["queued", "processing"] },
      },
      update,
      { new: true },
    );

    if (!document) {
      const existing = await Document.findById(documentId)
        .select("userId status processingError processingRequestedAt")
        .lean();
      if (!existing) {
        return res.status(404).json({ success: false, message: "Document not found." });
      }
      const expectedStatus = event === "completed" ? "processed" : "failed";
      if (
        event !== "retrying" &&
        existing.status === expectedStatus &&
        existing.processingRequestedAt?.getTime() === requestDate.getTime()
      ) {
        await documentProcessingEvents.publishDocumentStatus({
          userId: existing.userId,
          documentId,
          requestId,
          status: existing.status,
          processingError: existing.processingError,
        });
        return res.status(200).json({ success: true, duplicate: true });
      }
      return res.status(200).json({ success: true, ignored: true });
    }

    if (event === "completed") {
      try {
        const libraries = await documentLibraryService.syncDocumentToLibraries({
          userId: document.userId,
          documentId: document._id,
          extractedData: document.data,
        });
        if (libraries.length === 0) {
          console.warn("Document extraction completed without a library attachment.", {
            documentId: document._id.toString(),
          });
        }
      } catch (error) {
        console.error("Document extraction was saved, but library synchronization failed:", {
          documentId: document._id.toString(),
          message: error.message,
        });
      }
    }

    if (event === "completed" || event === "failed") {
      await documentProcessingEvents.publishDocumentStatus({
        userId: document.userId,
        documentId: document._id,
        requestId,
        status: document.status,
        processingError: document.processingError,
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to persist processing result:", error.message);
    return res.status(503).json({
      success: false,
      message: "Processing result could not be saved.",
    });
  }
}

module.exports = { getProcessingSource, receiveProcessingResult };
