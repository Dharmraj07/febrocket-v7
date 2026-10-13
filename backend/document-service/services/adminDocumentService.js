const Document = require("../models/Document");
const { isValidDocumentId } = require("../helpers/document");
const { getDocumentFile } = require("./documentService");
const r2Service = require("./r2Service");
const { removeDocumentReferences } = require("./documentLibraryService");

/* =====================================================
   VALIDATION HELPERS
   ===================================================== */

function isValidUserId(id) {
  return isValidDocumentId(id);
}

/* =====================================================
   LIST ALL DOCUMENTS (ADMIN)
   Supports: page, limit, userId, status, fileType, q, from, to
   ===================================================== */

async function listAllDocuments({
  page = 1,
  limit = 20,
  userId,
  status,
  fileType,
  q,
  from,
  to,
} = {}) {
  const filter = {};

  if (userId && isValidUserId(userId)) filter.userId = userId;
  if (status) filter.status = status;

  if (fileType) {
    // partial match: "image" matches "image/png", "image/jpeg"
    filter.fileType = { $regex: `^${fileType}`, $options: "i" };
  }

  if (q) {
    filter.$or = [
      { fileName: { $regex: q, $options: "i" } },
      { displayName: { $regex: q, $options: "i" } },
    ];
  }

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const skip = (page - 1) * limit;

  const [documents, total] = await Promise.all([
    Document.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("-data -rawText")
      .lean(),
    Document.countDocuments(filter),
  ]);

  return {
    documents,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  };
}

/* =====================================================
   GET SINGLE DOCUMENT (ADMIN — NO OWNERSHIP CHECK)
   ===================================================== */

async function findDocumentById(documentId) {
  if (!isValidDocumentId(documentId)) return null;
  return Document.findById(documentId).lean();
}

/* =====================================================
   STATS (ADMIN DASHBOARD)
   ===================================================== */

async function getDocumentStats() {
  const [total, byStatus, byType, totalSizeAgg] = await Promise.all([
    Document.countDocuments(),

    Document.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),

    Document.aggregate([
      {
        $group: {
          _id: {
            $arrayElemAt: [{ $split: ["$fileType", "/"] }, 0],
          },
          count: { $sum: 1 },
        },
      },
    ]),

    Document.aggregate([
      { $group: { _id: null, totalBytes: { $sum: "$fileSize" } } },
    ]),
  ]);

  return {
    totalDocuments: total,
    totalBytes: totalSizeAgg[0]?.totalBytes || 0,
    byStatus: byStatus.reduce(
      (acc, cur) => ({ ...acc, [cur._id]: cur.count }),
      {}
    ),
    byType: byType.reduce(
      (acc, cur) => ({ ...acc, [cur._id]: cur.count }),
      {}
    ),
  };
}

/* =====================================================
   DELETE ANY DOCUMENT (ADMIN)
   ===================================================== */

async function adminDeleteDocument({ documentId }) {
  const document = await Document.findByIdAndDelete(documentId);
  if (!document) return null;

  try {
    await r2Service.deleteFileFromR2(document.storageKey);
  } catch (error) {
    await Document.create(document.toObject());
    throw error;
  }

  await removeDocumentReferences({
    documentId,
    userId: document.userId,
  });
  return document;
}

module.exports = {
  isValidDocumentId,
  isValidUserId,
  listAllDocuments,
  findDocumentById,
  getDocumentStats,
  adminDeleteDocument,
  getDocumentFile,
};