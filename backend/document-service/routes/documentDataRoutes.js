const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  getUserDocumentData,
  getUserDocumentDataById,
  updateUserDocumentData,
  deleteUserDocumentData,
  getAllDocumentData,
  getDocumentDataForUser,
  getDocumentDataByIdAdmin,
  updateDocumentDataByIdAdmin,
  deleteDocumentDataByIdAdmin,
} = require("../controllers/documentDataController");

const router = express.Router();

router.get("/", authMiddleware(), getUserDocumentData);
router.get("/admin", authMiddleware({ adminOnly: true }), getAllDocumentData);
router.get("/admin/user/:userId", authMiddleware({ adminOnly: true }), getDocumentDataForUser);
router.get("/admin/:documentId", authMiddleware({ adminOnly: true }), getDocumentDataByIdAdmin);
router.put("/admin/:documentId", authMiddleware({ adminOnly: true }), updateDocumentDataByIdAdmin);
router.delete("/admin/:documentId", authMiddleware({ adminOnly: true }), deleteDocumentDataByIdAdmin);
router.get("/:documentId", authMiddleware(), getUserDocumentDataById);
router.put("/:documentId", authMiddleware(), updateUserDocumentData);
router.delete("/:documentId", authMiddleware(), deleteUserDocumentData);

module.exports = router;
