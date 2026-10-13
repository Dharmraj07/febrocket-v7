const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const documentEvents = require("../services/documentProcessingEvents");
const { streamDocumentEvents } = require("../controllers/documentController");

function createResponse() {
  const res = new EventEmitter();
  res.headersSent = false;
  res.writableEnded = false;
  res.destroyed = false;
  res.status = (status) => {
    res.statusCode = status;
    return res;
  };
  res.set = (headers) => {
    res.headers = headers;
    return res;
  };
  res.flushHeaders = () => {
    res.headersSent = true;
  };
  res.write = (chunk) => {
    res.chunks.push(chunk);
    return true;
  };
  res.end = () => {
    res.writableEnded = true;
    res.emit("close");
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  res.chunks = [];
  return res;
}

test("authenticated user event streams receive only their own document statuses", async () => {
  const originalSubscribe = documentEvents.subscribeToDocumentStatus;
  let publishToStream;
  let unsubscribed = false;
  documentEvents.subscribeToDocumentStatus = async (listener) => {
    publishToStream = listener;
    return async () => { unsubscribed = true; };
  };
  const res = createResponse();

  try {
    await streamDocumentEvents(
      { user: { id: "user-1", role: "user" } },
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["Content-Type"], "text/event-stream");
    publishToStream({
      eventId: "document-1:request-1:processed",
      userId: "user-2",
      documentId: "document-1",
      status: "processed",
    });
    publishToStream({
      eventId: "document-2:request-1:failed",
      userId: "user-1",
      documentId: "document-2",
      status: "failed",
      processingError: "Unable to process this document. Please try again.",
    });

    assert.equal(res.chunks.length, 2);
    assert.match(res.chunks[1], /document-2/u);
    assert.match(res.chunks[1], /"status":"failed"/u);
    assert.match(res.chunks[1], /processingError/u);
    res.emit("close");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(unsubscribed, true);
  } finally {
    res.emit("close");
    documentEvents.subscribeToDocumentStatus = originalSubscribe;
  }
});

test("admin event streams can receive document statuses across users", async () => {
  const originalSubscribe = documentEvents.subscribeToDocumentStatus;
  let publishToStream;
  documentEvents.subscribeToDocumentStatus = async (listener) => {
    publishToStream = listener;
    return async () => {};
  };
  const res = createResponse();

  try {
    await streamDocumentEvents(
      { user: { id: "admin-1", role: "admin" } },
      res,
    );
    publishToStream({
      eventId: "document-1:request-1:processed",
      userId: "user-1",
      documentId: "document-1",
      status: "processed",
    });
    assert.equal(res.chunks.length, 2);
    assert.match(res.chunks[1], /document-1/u);
  } finally {
    res.emit("close");
    documentEvents.subscribeToDocumentStatus = originalSubscribe;
  }
});
