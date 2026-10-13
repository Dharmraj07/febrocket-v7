const Document = require("../models/Document");
const r2Service = require("./r2Service");
const imageProcessing = require("./imageProcessing");
const { isValidDocumentId, generateStorageKey } = require("../helpers/document");
const { removeDocumentReferences } = require("./documentLibraryService");

async function uploadDocument({ userId, file }) {
  const storageKey = generateStorageKey(userId, file.originalname);
  let uploadedToR2 = false;
  let document;

  try {
    const processedFile = await imageProcessing.optimizeImage(file);

    await r2Service.uploadFileToR2({
      key: storageKey,
      fileBuffer: processedFile.buffer,
      contentType: processedFile.mimetype,
    });
    uploadedToR2 = true;

    document = await Document.create({
      userId,
      fileName: file.originalname,
      displayName: file.originalname,
      storageKey,
      publicUrl: null,
      fileType: processedFile.mimetype,
      fileSize: processedFile.size,
      status: "uploaded",
    });

    console.info("Document stored successfully", {
      storageKey,
      fileType: processedFile.mimetype,
      fileSize: processedFile.size,
      optimized: processedFile.optimized,
    });

    return document;
  } catch (error) {
    console.error("Document upload failed:", error.message);
    if (uploadedToR2) {
      try {
        await r2Service.deleteFileFromR2(storageKey);
      } catch (cleanupError) {
        console.error("Failed to clean up R2 file:", cleanupError.message);
      }
    }

    if (document) {
      try {
        await Document.deleteOne({ _id: document._id });
      } catch (cleanupError) {
        console.error(
          "Failed to clean up document metadata:",
          cleanupError.message,
        );
      }
    }

    throw error;
  }
}

async function listDocuments({ userId, page, limit }) {
  const skip = (page - 1) * limit;
  const [documents, total] = await Promise.all([
    Document.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      // Extraction text can dwarf metadata; details endpoints return it on demand.
      .select("-data -rawText")
      .lean(),
    Document.countDocuments({ userId }),
  ]);

  return {
    documents,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

async function findUserDocument(documentId, userId) {
  return Document.findOne({ _id: documentId, userId }).lean();
}

async function getDocumentFile(storageKey) {
  return r2Service.getFileFromR2(storageKey);
}

async function deleteDocument({ documentId, userId, storageKey }) {
  const deleted = await Document.findOneAndDelete({ _id: documentId, userId });
  if (!deleted) return false;

  try {
    await r2Service.deleteFileFromR2(storageKey);
  } catch (error) {
    await Document.create(deleted.toObject());
    throw error;
  }

  await removeDocumentReferences({ documentId, userId });
  return true;
}

module.exports = {
  isValidDocumentId,
  uploadDocument,
  listDocuments,
  findUserDocument,
  getDocumentFile,
  deleteDocument,
};