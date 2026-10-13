const test = require("node:test");
const assert = require("node:assert/strict");

const authenticateTransformationService = require("../middleware/transformationServiceAuth");
const { validateRequirements, buildPlan } = require("../utils/requirements");

function response() {
  return {
    statusCode: undefined,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("transformation service auth rejects missing and incorrect keys", () => {
  const originalKey = process.env.TRANSFORMATION_SERVICE_API_KEY;

  try {
    delete process.env.TRANSFORMATION_SERVICE_API_KEY;
    const missing = response();
    let continued = false;
    authenticateTransformationService({ get: () => "" }, missing, () => {
      continued = true;
    });
    assert.equal(missing.statusCode, 503);
    assert.equal(continued, false);

    process.env.TRANSFORMATION_SERVICE_API_KEY = "private-service-key";
    const invalid = response();
    authenticateTransformationService({ get: () => "wrong-key" }, invalid, () => {
      continued = true;
    });
    assert.equal(invalid.statusCode, 401);
    assert.equal(continued, false);

    const valid = response();
    authenticateTransformationService({ get: () => "private-service-key" }, valid, () => {
      continued = true;
    });
    assert.equal(continued, true);
  } finally {
    if (originalKey === undefined) {
      delete process.env.TRANSFORMATION_SERVICE_API_KEY;
    } else {
      process.env.TRANSFORMATION_SERVICE_API_KEY = originalKey;
    }
  }
});

test("valid documents pass requirement validation", () => {
  const result = validateRequirements(
    { format: "jpg", size: 1024 * 1024 },
    { format: "jpg", maxSize: 2 * 1024 * 1024 },
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});

test("compression plan is created for smaller file size constraints", () => {
  const plan = buildPlan(
    { format: "jpg", size: 1024 * 1024 },
    { format: "jpg", maxSize: 50 * 1024 },
  );

  assert.deepEqual(plan, ["compress"]);
});

test("format conversion plus compression is planned for a PDF requirement", () => {
  const plan = buildPlan(
    { format: "jpg", size: 5 * 1024 * 1024 },
    { format: "pdf", maxSize: 2 * 1024 * 1024 },
  );

  assert.ok(plan.includes("convert_to_pdf"));
  assert.ok(plan.includes("compress"));
});

test("crop resize convert and compress are planned for a size and dimension requirement", () => {
  const plan = buildPlan(
    { format: "png", size: 2 * 1024 * 1024, width: 1200, height: 1600 },
    { format: "jpg", width: 200, height: 230, maxSize: 100 * 1024 },
  );

  assert.ok(plan.includes("crop"));
  assert.ok(plan.includes("resize"));
  assert.ok(plan.includes("convert_to_jpg"));
  assert.ok(plan.includes("compress"));
});
