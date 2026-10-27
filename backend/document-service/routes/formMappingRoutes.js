const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const resolveWorkspaceOwner = require("../middleware/resolveWorkspaceOwner");
const {
  analyzeForm,
  createFormSession,
  getFormContext,
  mapFormFields,
  recordFormFeedback,
  resolveFormField,
} = require("../controllers/formMappingController");

const router = express.Router();

router.use(authMiddleware(), resolveWorkspaceOwner);

router.post("/session", createFormSession);
router.post("/analyze", analyzeForm);
router.post("/context", getFormContext);
router.post("/map", mapFormFields);
router.post("/resolve", resolveFormField);
router.post("/feedback", recordFormFeedback);

module.exports = router;
