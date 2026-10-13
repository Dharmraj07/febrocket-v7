const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  analyzeForm,
  createFormSession,
  getFormContext,
  mapFormFields,
  recordFormFeedback,
  resolveFormField,
} = require("../controllers/formMappingController");

const router = express.Router();

router.post("/session", authMiddleware(), createFormSession);
router.post("/analyze", authMiddleware(), analyzeForm);
router.post("/context", authMiddleware(), getFormContext);
router.post("/map", authMiddleware(), mapFormFields);
router.post("/resolve", authMiddleware(), resolveFormField);
router.post("/feedback", authMiddleware(), recordFormFeedback);

module.exports = router;
