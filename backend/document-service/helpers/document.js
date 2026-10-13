const { Types } = require("mongoose");

function isValidDocumentId(documentId) {
  return Types.ObjectId.isValid(documentId);
}

function sanitizeFileName(fileName = "") {
  return String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
}

const crypto = require("crypto");

function generateStorageKey(userId, fileName) {
  const randomSuffix = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString("hex");
  return `users/${userId}/${Date.now()}-${randomSuffix}-${sanitizeFileName(fileName)}`;
}

module.exports = {
  isValidDocumentId,
  sanitizeFileName,
  generateStorageKey,
};
