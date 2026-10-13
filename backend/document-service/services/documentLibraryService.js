const Document = require("../models/Document");
const DocumentLibrary = require("../models/DocumentLibrary");
const { normalizePersonName } = require("../helpers/personName");

function createServiceError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getDisplayName(name) {
  return name.trim().replace(/\s+/gu, " ");
}

function getPersonNames(extractedData) {
  const person = extractedData?.person;
  if (!person || typeof person !== "object" || Array.isArray(person)) return [];
  if (person.identificationStatus !== "identified") return [];

  const candidates = Array.isArray(person.persons)
    ? person.persons
    : person.fullName
      ? [{ fullName: person.fullName }]
      : [];
  const uniqueNames = new Map();

  for (const candidate of candidates) {
    const fullName = typeof candidate === "string"
      ? candidate
      : candidate?.fullName;
    const normalizedName = normalizePersonName(fullName);
    if (normalizedName && !uniqueNames.has(normalizedName)) {
      uniqueNames.set(normalizedName, getDisplayName(fullName));
    }
  }

  return [...uniqueNames.values()];
}

async function findOrCreateDocumentLibrary({ userId, name }) {
  const normalizedName = normalizePersonName(name);
  if (!normalizedName) {
    throw createServiceError("A person's name is required.", 400);
  }

  const filter = { userId, normalizedName };
  try {
    return await DocumentLibrary.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          userId,
          name: getDisplayName(name),
          normalizedName,
          documents: [],
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;

    const existingLibrary = await DocumentLibrary.findOne(filter);
    if (existingLibrary) return existingLibrary;
    throw error;
  }
}

function getDocumentType(extractedData) {
  const documentType = extractedData?.document?.documentType;
  return typeof documentType === "string" && documentType.trim()
    ? documentType.trim()
    : "unknown";
}

function getDocumentReferenceFilter(documentId) {
  return { "documents.documentId": documentId };
}

async function attachDocument({ libraryId, documentId, userId }) {
  const document = await Document.findOne({ _id: documentId, userId })
    .select("data fileType fileSize")
    .lean();
  if (!document) {
    throw createServiceError("Document not found.", 404);
  }

  const entry = {
    documentId,
    fileType: document.fileType,
    fileSize: document.fileSize,
    documentType: getDocumentType(document.data),
    data: document.data || {},
  };
  const libraryFilter = { _id: libraryId, userId };
  const options = { new: true, runValidators: true };
  const library = await DocumentLibrary.findOneAndUpdate(
    { ...libraryFilter, ...getDocumentReferenceFilter(documentId) },
    { $set: { "documents.$": entry } },
    options,
  ) || await DocumentLibrary.findOneAndUpdate(
    {
      ...libraryFilter,
      "documents.documentId": { $ne: documentId },
    },
    { $push: { documents: entry } },
    options,
  ) || await DocumentLibrary.findOneAndUpdate(
    { ...libraryFilter, ...getDocumentReferenceFilter(documentId) },
    { $set: { "documents.$": entry } },
    options,
  );
  if (!library) {
    throw createServiceError("Document library not found.", 404);
  }

  return library;
}

async function syncDocumentToLibraries({ userId, documentId, extractedData }) {
  const names = getPersonNames(extractedData);
  if (names.length === 0) names.push("Uncategorized");
  const libraries = [];

  for (const name of names) {
    const library = await findOrCreateDocumentLibrary({ userId, name });
    libraries.push(
      await attachDocument({ libraryId: library._id, documentId, userId }),
    );
  }

  return libraries;
}

async function getUserLibraries(userId) {
  return DocumentLibrary.find({ userId }).sort({ name: 1 }).lean();
}

async function getUserLibrary({ libraryId, userId }) {
  return DocumentLibrary.findOne({ _id: libraryId, userId }).lean();
}

async function getLibraryDocuments({ libraryId, userId }) {
  const library = await DocumentLibrary.findOne({ _id: libraryId, userId }).lean();
  if (!library) return null;

  const documentIds = library.documents.map((entry) => entry?.documentId || entry);
  const documents = await Document.find({
    _id: { $in: documentIds },
    userId,
  }).sort({ createdAt: -1 }).lean();

  return { library, documents };
}

async function updateLibraryName({ libraryId, userId, name }) {
  const normalizedName = normalizePersonName(name);
  if (!normalizedName) {
    throw createServiceError("A person's name is required.", 400);
  }

  try {
    return await DocumentLibrary.findOneAndUpdate(
      { _id: libraryId, userId },
      {
        $set: {
          name: getDisplayName(name),
          normalizedName,
        },
      },
      { new: true, runValidators: true },
    );
  } catch (error) {
    if (error.code === 11000) {
      throw createServiceError(
        "A person with this name already exists in your document library.",
        409,
      );
    }
    throw error;
  }
}

async function deleteUserLibrary({ libraryId, userId }) {
  return DocumentLibrary.findOneAndDelete({ _id: libraryId, userId });
}

async function removeDocumentReferences({ documentId, userId }) {
  const libraries = await DocumentLibrary.find({
    userId,
    ...getDocumentReferenceFilter(documentId),
  })
    .select("_id")
    .lean();
  const libraryIds = libraries.map(({ _id }) => _id);

  if (libraryIds.length > 0) {
    await DocumentLibrary.updateMany(
      {
        _id: { $in: libraryIds },
        userId,
        ...getDocumentReferenceFilter(documentId),
      },
      {
        $pull: {
          documents: {
            documentId,
          },
        },
      },
    );
  }

  await DocumentLibrary.deleteMany({
    userId,
    documents: { $size: 0 },
  });
}

module.exports = {
  getPersonNames,
  findOrCreateDocumentLibrary,
  attachDocument,
  syncDocumentToLibraries,
  getUserLibraries,
  getUserLibrary,
  getLibraryDocuments,
  updateLibraryName,
  deleteUserLibrary,
  removeDocumentReferences,
};
