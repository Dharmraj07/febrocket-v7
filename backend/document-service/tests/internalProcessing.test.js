const test = require("node:test");
const assert = require("node:assert/strict");
const Document = require("../models/Document");
const r2Service = require("../services/r2Service");
const documentLibraryService = require("../services/documentLibraryService");
const documentProcessingEvents = require("../services/documentProcessingEvents");
const authenticateProcessingService = require("../middleware/processingServiceAuth");
const {
  getProcessingSource,
  receiveProcessingResult,
} = require("../controllers/processingController");

function replace(target, key, value) {
  const original = target[key];
  target[key] = value;
  return () => {
    target[key] = original;
  };
}

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

function queryResult(value) {
  return {
    select() {
      return this;
    },
    lean: async () => value,
  };
}

test("processing service authentication rejects missing and incorrect keys", () => {
  const originalKey = process.env.PROCESSING_SERVICE_API_KEY;
  process.env.PROCESSING_SERVICE_API_KEY = "private-service-key";
  const res = response();
  let continued = false;

  try {
    delete process.env.PROCESSING_SERVICE_API_KEY;
    authenticateProcessingService(
      { get: () => "" },
      res,
      () => { continued = true; },
    );
    assert.equal(res.statusCode, 503);

    process.env.PROCESSING_SERVICE_API_KEY = "private-service-key";
    const invalidResponse = response();
    authenticateProcessingService(
      { get: () => "wrong-key" },
      invalidResponse,
      () => { continued = true; },
    );
    assert.equal(invalidResponse.statusCode, 401);
    assert.equal(continued, false);

    const validResponse = response();
    authenticateProcessingService(
      { get: () => "private-service-key" },
      validResponse,
      () => { continued = true; },
    );
    assert.equal(continued, true);
  } finally {
    if (originalKey === undefined) delete process.env.PROCESSING_SERVICE_API_KEY;
    else process.env.PROCESSING_SERVICE_API_KEY = originalKey;
  }
});

test("source endpoint marks the current job processing and returns only a signed URL", async () => {
  const requestId = "2026-10-05T10:00:00.000Z";
  const stored = {
    fileName: "scan.pdf",
    fileType: "application/pdf",
    storageKey: "users/private/scan.pdf",
  };
  let captured;
  const restores = [
    replace(Document, "findOneAndUpdate", (filter, update, options) => {
      captured = { filter, update, options };
      return queryResult(stored);
    }),
    replace(r2Service, "getSignedFileUrl", async (key, expiry) => {
      assert.equal(key, stored.storageKey);
      assert.equal(expiry, 300);
      return "https://r2.example/signed";
    }),
  ];
  const res = response();

  try {
    await getProcessingSource(
      {
        params: { id: "507f1f77bcf86cd799439011" },
        query: { requestId },
      },
      res,
    );
    assert.equal(captured.filter.processingRequestedAt.getTime(), Date.parse(requestId));
    assert.deepEqual(captured.filter.status, { $in: ["queued", "processing"] });
    assert.equal(captured.update.$set.status, "processing");
    assert.deepEqual(res.body.document, {
      documentId: "507f1f77bcf86cd799439011",
      fileName: "scan.pdf",
      fileType: "application/pdf",
      signedUrl: "https://r2.example/signed",
    });
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("completed result persists extracted fields and syncs libraries in Document-Service", async () => {
  const requestId = "2026-10-05T10:00:00.000Z";
  const data = {
    person: { identificationStatus: "identified", persons: [{ fullName: "A Person" }] },
    document: { documentType: "Certificate" },
  };
  const document = {
    _id: "507f1f77bcf86cd799439011",
    userId: "user-1",
    data,
    status: "processed",
    processingError: null,
  };
  let captured;
  let syncInput;
  let publishedEvent;
  const restores = [
    replace(Document, "findOneAndUpdate", async (filter, update, options) => {
      captured = { filter, update, options };
      return document;
    }),
    replace(documentLibraryService, "getPersonNames", () => ["A Person"]),
    replace(documentLibraryService, "syncDocumentToLibraries", async (input) => {
      syncInput = input;
      return [{ _id: "library-1" }];
    }),
    replace(documentProcessingEvents, "publishDocumentStatus", async (event) => {
      publishedEvent = event;
    }),
  ];
  const res = response();

  try {
    await receiveProcessingResult(
      {
        body: {
          documentId: document._id,
          requestId,
          event: "completed",
          data,
          displayName: "Certificate",
        },
      },
      res,
    );
    assert.equal(captured.filter.processingRequestedAt.getTime(), Date.parse(requestId));
    assert.deepEqual(captured.filter.status, { $in: ["queued", "processing"] });
    assert.deepEqual(captured.update.$set.data, data);
    assert.equal(captured.update.$set.displayName, "Certificate");
    assert.equal(captured.update.$set.status, "processed");
    assert.equal(captured.update.$set.extractionMethod, "llm");
    assert.equal(captured.update.$set.processingVersion, "1.0");
    assert.deepEqual(syncInput, {
      userId: "user-1",
      documentId: document._id,
      extractedData: data,
    });
    assert.deepEqual(publishedEvent, {
      userId: "user-1",
      documentId: document._id,
      requestId,
      status: "processed",
      processingError: null,
    });
    assert.equal(res.statusCode, 200);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("retrying and failed events update only processing status", async () => {
  const requestId = "2026-10-05T10:00:00.000Z";
  const original = Document.findOneAndUpdate;
  const updates = [];
  const originalPublish = documentProcessingEvents.publishDocumentStatus;
  const publishedEvents = [];
  Document.findOneAndUpdate = async (_filter, update) => {
    updates.push(update);
    return {
      _id: "507f1f77bcf86cd799439011",
      userId: "user-1",
      status: update.$set.status,
      processingError: update.$set.processingError,
    };
  };
  documentProcessingEvents.publishDocumentStatus = async (event) => {
    publishedEvents.push(event);
  };

  try {
    for (const event of ["retrying", "failed"]) {
      await receiveProcessingResult(
        {
          body: {
            documentId: "507f1f77bcf86cd799439011",
            requestId,
            event,
          },
        },
        response(),
      );
    }
    assert.equal(updates[0].$set.status, "queued");
    assert.equal(updates[1].$set.status, "failed");
    assert.equal(updates[0].$set.processingError, updates[1].$set.processingError);
    assert.equal(publishedEvents.length, 1);
    assert.equal(publishedEvents[0].status, "failed");
    assert.equal(publishedEvents[0].processingError, updates[1].$set.processingError);
  } finally {
    Document.findOneAndUpdate = original;
    documentProcessingEvents.publishDocumentStatus = originalPublish;
  }
});

test("duplicate terminal callbacks republish the persisted event without changing status", async () => {
  const requestId = "2026-10-05T10:00:00.000Z";
  const documentId = "507f1f77bcf86cd799439011";
  const originalUpdate = Document.findOneAndUpdate;
  const originalFindById = Document.findById;
  const originalPublish = documentProcessingEvents.publishDocumentStatus;
  const published = [];
  Document.findOneAndUpdate = async () => null;
  Document.findById = () => queryResult({
    userId: "user-1",
    status: "processed",
    processingError: null,
    processingRequestedAt: new Date(requestId),
  });
  documentProcessingEvents.publishDocumentStatus = async (event) => {
    published.push(event);
  };
  const res = response();

  try {
    await receiveProcessingResult(
      {
        body: {
          documentId,
          requestId,
          event: "completed",
          data: {},
          displayName: "Certificate",
        },
      },
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.duplicate, true);
    assert.deepEqual(published, [{
      userId: "user-1",
      documentId,
      requestId,
      status: "processed",
      processingError: null,
    }]);
  } finally {
    Document.findOneAndUpdate = originalUpdate;
    Document.findById = originalFindById;
    documentProcessingEvents.publishDocumentStatus = originalPublish;
  }
});
