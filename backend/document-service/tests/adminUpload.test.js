const test = require("node:test");
const assert = require("node:assert/strict");

const documentService = require("../services/documentService");
const documentQueue = require("../services/documentQueue");
const Document = require("../models/Document");
const axios = require("axios");

let createdDocumentInput;
let enqueuedDocument;
let userLookupResult;
let queueFailure;

documentService.uploadDocument = async (input) => {
  createdDocumentInput = input;
  return {
    _id: "507f1f77bcf86cd799439012",
    userId: input.userId,
    storageKey: "users/target/file.pdf",
  };
};
documentService.deleteDocument = async () => true;
documentQueue.enqueueDocumentProcessing = async (document) => {
  if (queueFailure) throw queueFailure;
  enqueuedDocument = document;
  return { ...document, status: "queued" };
};
axios.get = async (...args) => {
  if (userLookupResult instanceof Error) throw userLookupResult;
  userLookupResult = args;
  return { data: { success: true, user: { id: "507f1f77bcf86cd799439011" } } };
};

const { adminUploadDocument } = require("../controllers/adminDocumentController");

const response = () => ({
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
});

test("admin upload rejects invalid user IDs and missing files", async () => {
  const invalidIdResponse = response();
  await adminUploadDocument(
    { params: { id: "invalid" }, file: { buffer: Buffer.from("file") } },
    invalidIdResponse,
  );
  assert.equal(invalidIdResponse.statusCode, 400);

  const missingFileResponse = response();
  await adminUploadDocument(
    { params: { id: "507f1f77bcf86cd799439011" } },
    missingFileResponse,
  );
  assert.equal(missingFileResponse.statusCode, 400);
});

test("admin upload verifies target user and queues document under that user", async () => {
  createdDocumentInput = undefined;
  enqueuedDocument = undefined;
  userLookupResult = undefined;
  const req = {
    params: { id: "507f1f77bcf86cd799439011" },
    headers: { authorization: "Bearer admin-token" },
    file: {
      buffer: Buffer.from("document"),
      originalname: "file.pdf",
      mimetype: "application/pdf",
    },
  };
  const res = response();

  await adminUploadDocument(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(createdDocumentInput.userId, req.params.id);
  assert.equal(createdDocumentInput.file, req.file);
  assert.equal(enqueuedDocument.userId, req.params.id);
  assert.equal(userLookupResult[0], "http://localhost:3001/api/auth/admin/users/507f1f77bcf86cd799439011");
  assert.equal(userLookupResult[1].headers.authorization, req.headers.authorization);
});

test("admin upload returns not found when auth service has no target user", async () => {
  const originalGet = axios.get;
  axios.get = async () => {
    const error = new Error("not found");
    error.response = { status: 404 };
    throw error;
  };

  const res = response();
  await adminUploadDocument(
    {
      params: { id: "507f1f77bcf86cd799439011" },
      headers: {},
      file: { buffer: Buffer.from("document") },
    },
    res,
  );
  axios.get = originalGet;

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, "User not found.");
});

test("admin upload retains a stored document when queueing fails", async () => {
  const originalRedisUrl = process.env.REDIS_URL;
  const originalFindByIdAndUpdate = Document.findByIdAndUpdate;
  const originalFindById = Document.findById;
  const originalFindOneAndDelete = Document.findOneAndDelete;
  let deleteCalls = 0;
  queueFailure = new Error("Redis unavailable");
  delete process.env.REDIS_URL;
  Document.findByIdAndUpdate = async (_id, update) => ({
    _id: "507f1f77bcf86cd799439012",
    ...update.$set,
  });
  Document.findById = () => ({
    lean: async () => ({
      _id: "507f1f77bcf86cd799439012",
      status: "failed",
    }),
  });
  Document.findOneAndDelete = async () => {
    deleteCalls += 1;
    return null;
  };

  try {
    const res = response();
    await adminUploadDocument(
      {
        params: { id: "507f1f77bcf86cd799439011" },
        headers: {},
        file: { buffer: Buffer.from("document") },
      },
      res,
    );
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.document.status, "failed");
    assert.equal(deleteCalls, 0);
  } finally {
    Document.findByIdAndUpdate = originalFindByIdAndUpdate;
    Document.findById = originalFindById;
    Document.findOneAndDelete = originalFindOneAndDelete;
    queueFailure = undefined;
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
  }
});
