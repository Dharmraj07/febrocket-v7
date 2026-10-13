const express = require("express");
const authenticateProcessingService = require("../middleware/processingServiceAuth");
const {
  getProcessingSource,
  receiveProcessingResult,
} = require("../controllers/processingController");

const router = express.Router();

router.use(authenticateProcessingService);
router.get("/documents/:id/source", getProcessingSource);
router.post("/results", receiveProcessingResult);

module.exports = router;
