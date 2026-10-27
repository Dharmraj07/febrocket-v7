const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const resolveWorkspaceOwner = require("../middleware/resolveWorkspaceOwner");
const {
  resolveLibrary,
  attachDocument,
  getLibraries,
  getLibrary,
  getLibraryDocuments,
  renameLibrary,
  deleteLibrary,
} = require("../controllers/documentLibraryController");

const router = express.Router();

// Require an authenticated user for every document-library endpoint.
router.use(authMiddleware(), resolveWorkspaceOwner);

// POST /api/document-library/resolve
// Find or create the current user's person library by name.
router.post("/resolve", resolveLibrary);

// POST /api/document-library/:libraryId/documents
// Add one of the current user's documents to this library.
router.post("/:libraryId/documents", attachDocument);

// GET /api/document-library
// List the current user's person libraries.
router.get("/", getLibraries);

// GET /api/document-library/:libraryId/documents
// Return a library and its documents, scoped to the current user.
router.get("/:libraryId/documents", getLibraryDocuments);

// GET /api/document-library/:libraryId
// Return one of the current user's person libraries.
router.get("/:libraryId", getLibrary);

// PATCH /api/document-library/:libraryId
// Rename one of the current user's person libraries.
router.patch("/:libraryId", renameLibrary);

// DELETE /api/document-library/:libraryId
// Delete one of the current user's person libraries.
router.delete("/:libraryId", deleteLibrary);

module.exports = router;
