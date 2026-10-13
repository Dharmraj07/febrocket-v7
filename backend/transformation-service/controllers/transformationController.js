const { validateRequirements, buildPlan } = require("../utils/requirements");
const {
  analyzeSourceDocument,
  performTransformation,
  generateJobId,
  createTemporaryFile,
  removeTemporaryFile,
} = require("../services/transformationService");

function safeObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
}

async function analyzeDocument(req, res) {
  try {
    const body = safeObject(req.body);
    const sourceUrl = body.sourceUrl || body.url;
    const sourceName = body.sourceName || body.fileName || "document";
    const requirements = body.requirements || {};

    const document = await analyzeSourceDocument({
      sourceUrl,
      sourceBuffer: body.sourceBuffer ? Buffer.from(body.sourceBuffer, "base64") : undefined,
      sourceName,
      requirements,
    });

    return res.status(200).json({
      success: true,
      document,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Unable to analyze document.",
    });
  }
}

async function validateRequirementsHandler(req, res) {
  try {
    const body = safeObject(req.body);
    const documentInfo = safeObject(body.document || body.input || {});
    const requirements = safeObject(body.requirements || {});
    const result = validateRequirements(documentInfo, requirements);

    return res.status(200).json({
      success: true,
      valid: result.valid,
      issues: result.issues,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Unable to validate document requirements.",
    });
  }
}

async function planTransformation(req, res) {
  try {
    const body = safeObject(req.body);
    const documentInfo = safeObject(body.document || body.input || {});
    const requirements = safeObject(body.requirements || {});
    const plan = buildPlan(documentInfo, requirements);

    return res.status(200).json({
      success: true,
      operations: plan,
      valid: plan.length === 0,
      needsTransformation: plan.length > 0,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Unable to plan transformation.",
    });
  }
}

async function transformDocument(req, res) {
  try {
    const body = safeObject(req.body);
    const requirements = safeObject(body.requirements || {});
    const documentInfo = safeObject(body.document || body.input || {});
    const jobId = body.jobId || generateJobId("tr");

    if (!documentInfo.size && body.sourceUrl) {
      const source = await analyzeSourceDocument({ sourceUrl: body.sourceUrl, sourceName: body.sourceName || "document", requirements });
      Object.assign(documentInfo, source);
    }

    const result = await performTransformation(documentInfo, requirements, { jobId });

    return res.status(200).json({
      success: true,
      jobId,
      status: result.status || (result.validation?.valid ? "compatible" : "ready"),
      output: {
        format: result.output?.format || documentInfo.format || "unknown",
        mimeType: result.output?.mimeType || documentInfo.mimeType || "application/octet-stream",
        size: result.output?.size || documentInfo.size || 0,
      },
      operations: result.operations || [],
      validation: result.validation || { valid: true, issues: [] },
      temporaryReference: result.jobId || jobId,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Transformation failed.",
    });
  }
}

async function getTransformJob(_req, res) {
  return res.status(200).json({
    success: true,
    status: "completed",
    message: "Transformation job metadata is available for downstream integration.",
  });
}

async function deleteTemporaryFile(req, res) {
  try {
    const { jobId } = req.params;
    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: "Temporary job ID is required.",
      });
    }

    await removeTemporaryFile(jobId);
    return res.status(200).json({
      success: true,
      message: "Temporary transformation artifacts cleaned up.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to clean up temporary artifacts.",
    });
  }
}

async function receiveTransformationResult(req, res) {
  return res.status(200).json({
    success: true,
    message: "Transformation result received.",
  });
}

async function receiveTransformationFailure(req, res) {
  return res.status(200).json({
    success: true,
    message: "Transformation failure recorded.",
  });
}

module.exports = {
  analyzeDocument,
  validateRequirements: validateRequirementsHandler,
  planTransformation,
  transformDocument,
  getTransformJob,
  deleteTemporaryFile,
  receiveTransformationResult,
  receiveTransformationFailure,
};
