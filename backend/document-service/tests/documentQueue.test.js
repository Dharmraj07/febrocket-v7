const test = require("node:test");
const assert = require("node:assert/strict");
const { Queue } = require("bullmq");
const Document = require("../models/Document");
const {
  enqueueDocumentProcessing,
  retryDocumentProcessing,
  closeDocumentQueue,
} = require("../services/documentQueue");

test("enqueue and retry persist a server processing timestamp", async () => {
  const originalRedisUrl = process.env.REDIS_URL;
  const originalAdd = Queue.prototype.add;
  const originalFindByIdAndUpdate = Document.findByIdAndUpdate;
  const originalFindOneAndUpdate = Document.findOneAndUpdate;
  const jobs = [];
  process.env.REDIS_URL = "redis://127.0.0.1:6379";
  Queue.prototype.add = async function add(name, data, options) {
    jobs.push({ name, data, options });
  };

  try {
    const document = {
      _id: "document-1",
      userId: "user-1",
      status: "uploaded",
    };
    Document.findByIdAndUpdate = async (_id, update) => ({
      ...document,
      ...update.$set,
    });

    const queued = await enqueueDocumentProcessing(document);
    assert.equal(queued.status, "queued");
    assert.ok(queued.processingRequestedAt instanceof Date);
    assert.equal(jobs.length, 1);
    assert.deepEqual(Object.keys(jobs[0].data), ["documentId", "requestId"]);
    assert.equal(jobs[0].data.documentId, "document-1");
    assert.equal(new Date(jobs[0].data.requestId).getTime(), queued.processingRequestedAt.getTime());

    Document.findOneAndUpdate = async (_filter, update) => ({
      ...document,
      ...update.$set,
    });
    const retried = await retryDocumentProcessing({
      documentId: "document-1",
      userId: "user-1",
    });
    assert.equal(retried.status, "queued");
    assert.ok(retried.processingRequestedAt instanceof Date);
    assert.equal(jobs.length, 2);
    assert.equal(jobs[1].data.documentId, "document-1");
    assert.equal(new Date(jobs[1].data.requestId).getTime(), retried.processingRequestedAt.getTime());
    assert.equal("userId" in jobs[1].data, false);
  } finally {
    await closeDocumentQueue();
    Queue.prototype.add = originalAdd;
    Document.findByIdAndUpdate = originalFindByIdAndUpdate;
    Document.findOneAndUpdate = originalFindOneAndUpdate;
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
  }
});

test("a missing Redis queue marks the retained document failed instead of discarding it", async () => {
  const originalRedisUrl = process.env.REDIS_URL;
  const originalFindByIdAndUpdate = Document.findByIdAndUpdate;
  let update;
  delete process.env.REDIS_URL;
  Document.findByIdAndUpdate = async (_id, value) => {
    update = value;
    return { _id: "document-1", ...value.$set };
  };

  try {
    await assert.rejects(
      enqueueDocumentProcessing({ _id: "document-1" }),
      /Document queue is not configured/,
    );
    assert.equal(update.$set.status, "failed");
    assert.match(update.$set.processingError, /temporarily unavailable/u);
  } finally {
    Document.findByIdAndUpdate = originalFindByIdAndUpdate;
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
  }
});
