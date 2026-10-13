const express = require("express");
const authenticateTransformationService = require("../middleware/transformationServiceAuth");
const {
  analyzeDocument,
  validateRequirements,
  planTransformation,
  transformDocument,
  getTransformJob,
  deleteTemporaryFile,
  receiveTransformationResult,
  receiveTransformationFailure,
} = require("../controllers/transformationController");

const router = express.Router();

router.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    service: "transformation-service",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

router.post("/analyze", analyzeDocument);
router.post("/validate", validateRequirements);
router.post("/plan", planTransformation);
router.post("/transform", transformDocument);
router.get("/transform/:jobId", getTransformJob);
router.delete("/temporary/:jobId", deleteTemporaryFile);

router.use("/internal", authenticateTransformationService);
router.post("/internal/transformation/results", receiveTransformationResult);
router.post("/internal/transformation/failures", receiveTransformationFailure);

module.exports = router;
