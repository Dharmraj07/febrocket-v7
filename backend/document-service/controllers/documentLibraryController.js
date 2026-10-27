const mongoose = require("mongoose");
const documentLibraryService = require("../services/documentLibraryService");

function isRequestBody(body) {
  return Boolean(body && typeof body === "object" && !Array.isArray(body));
}

function validateLibraryId(libraryId, res) {
  if (!mongoose.Types.ObjectId.isValid(libraryId)) {
    res.status(400).json({ success: false, message: "Invalid document library ID." });
    return false;
  }
  return true;
}

function handleError(error, operation, res) {
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "A person with this name already exists in your document library.",
    });
  }

  if (error.status) {
    return res.status(error.status).json({ success: false, message: error.message });
  }

  console.error(`${operation} failed:`, error);
  return res.status(500).json({
    success: false,
    message: `${operation} failed.`,
  });
}

async function resolveLibrary(req, res) {
  if (!isRequestBody(req.body) || typeof req.body.name !== "string" || !req.body.name.trim()) {
    return res.status(400).json({
      success: false,
      message: "A non-empty name is required.",
    });
  }

  try {
    const library = await documentLibraryService.findOrCreateDocumentLibrary({
      userId: req.workspaceOwnerId || req.user.id,
      name: req.body.name,
    });
    return res.status(200).json({ success: true, library });
  } catch (error) {
    return handleError(error, "Resolve document library", res);
  }
}

async function attachDocument(req, res) {
  if (!validateLibraryId(req.params.libraryId, res)) return;
  if (!isRequestBody(req.body) || typeof req.body.documentId !== "string") {
    return res.status(400).json({
      success: false,
      message: "A valid documentId is required.",
    });
  }
  if (!mongoose.Types.ObjectId.isValid(req.body.documentId)) {
    return res.status(400).json({ success: false, message: "Invalid document ID." });
  }

  try {
    const library = await documentLibraryService.attachDocument({
      libraryId: req.params.libraryId,
      documentId: req.body.documentId,
      userId: req.workspaceOwnerId || req.user.id,
    });
    return res.status(200).json({ success: true, library });
  } catch (error) {
    return handleError(error, "Attach document", res);
  }
}

async function getLibraries(req, res) {
  try {
    const libraries = await documentLibraryService.getUserLibraries(
      req.workspaceOwnerId || req.user.id,
    );
    return res.status(200).json({ success: true, libraries });
  } catch (error) {
    return handleError(error, "Fetch document libraries", res);
  }
}

async function getLibrary(req, res) {
  if (!validateLibraryId(req.params.libraryId, res)) return;

  try {
    const library = await documentLibraryService.getUserLibrary({
      libraryId: req.params.libraryId,
      userId: req.workspaceOwnerId || req.user.id,
    });
    if (!library) {
      return res.status(404).json({ success: false, message: "Document library not found." });
    }
    return res.status(200).json({ success: true, library });
  } catch (error) {
    return handleError(error, "Fetch document library", res);
  }
}

async function getLibraryDocuments(req, res) {
  if (!validateLibraryId(req.params.libraryId, res)) return;

  try {
    const result = await documentLibraryService.getLibraryDocuments({
      libraryId: req.params.libraryId,
      userId: req.workspaceOwnerId || req.user.id,
    });
    if (!result) {
      return res.status(404).json({ success: false, message: "Document library not found." });
    }
    return res.status(200).json({
      success: true,
      library: result.library,
      documents: result.documents,
    });
  } catch (error) {
    return handleError(error, "Fetch document library documents", res);
  }
}

async function renameLibrary(req, res) {
  if (!validateLibraryId(req.params.libraryId, res)) return;
  if (!isRequestBody(req.body) || typeof req.body.name !== "string" || !req.body.name.trim()) {
    return res.status(400).json({
      success: false,
      message: "A non-empty name is required.",
    });
  }

  try {
    const library = await documentLibraryService.updateLibraryName({
      libraryId: req.params.libraryId,
      userId: req.workspaceOwnerId || req.user.id,
      name: req.body.name,
    });
    if (!library) {
      return res.status(404).json({ success: false, message: "Document library not found." });
    }
    return res.status(200).json({ success: true, library });
  } catch (error) {
    return handleError(error, "Rename document library", res);
  }
}

async function deleteLibrary(req, res) {
  if (!validateLibraryId(req.params.libraryId, res)) return;
  if (req.isConnectedWorkspace) {
    return res.status(403).json({
      success: false,
      message: "You cannot delete a connected account's document library.",
    });
  }

  try {
    const library = await documentLibraryService.deleteUserLibrary({
      libraryId: req.params.libraryId,
      userId: req.user.id,
    });
    if (!library) {
      return res.status(404).json({ success: false, message: "Document library not found." });
    }
    return res.status(200).json({
      success: true,
      message: "Document library deleted successfully.",
    });
  } catch (error) {
    return handleError(error, "Delete document library", res);
  }
}

module.exports = {
  resolveLibrary,
  attachDocument,
  getLibraries,
  getLibrary,
  getLibraryDocuments,
  renameLibrary,
  deleteLibrary,
};
