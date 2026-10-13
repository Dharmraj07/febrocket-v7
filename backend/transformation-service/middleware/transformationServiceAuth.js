const { timingSafeEqual } = require("node:crypto");

function authenticateTransformationService(req, res, next) {
  const expectedKey = process.env.TRANSFORMATION_SERVICE_API_KEY;
  const suppliedKey = req.get("x-transformation-service-key") || "";

  if (!expectedKey) {
    return res.status(503).json({
      success: false,
      message: "Transformation service authentication is not configured.",
    });
  }

  const expected = Buffer.from(expectedKey);
  const supplied = Buffer.from(suppliedKey);

  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized transformation service request.",
    });
  }

  return next();
}

module.exports = authenticateTransformationService;
