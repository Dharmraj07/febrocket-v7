const { Queue } = require("bullmq");
const Document = require("../models/Document");
const { hasRedisConfig, getRedisConnectionOptions } = require("../helpers/redis");

let documentQueue;

function getDocumentQueue() {
  if (!hasRedisConfig(process.env.REDIS_URL)) {
    return null;
  }

  if (documentQueue) return documentQueue;

  documentQueue = new Queue("document-processing", {
    connection: getRedisConnectionOptions(process.env.REDIS_URL),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
  documentQueue.on("error", (error) => {
    console.error("Document queue error:", error.message);
  });
  return documentQueue;
}

async function enqueueDocumentProcessing(document) {
  const documentQueue = getDocumentQueue();
  const requestDate = new Date();
  const requestId = requestDate.toISOString();

  if (!documentQueue) {
    await Document.findByIdAndUpdate(document._id, {
      $set: {
        status: "failed",
        processingError: "Document processing is temporarily unavailable. Please retry.",
      },
    });
    throw new Error("Document queue is not configured. Set REDIS_URL to enable background processing.");
  }

  const queuedDocument = await Document.findByIdAndUpdate(
    document._id,
    {
      $set: {
        status: "queued",
        processingError: null,
        processingRequestedAt: requestDate,
      },
    },
    { new: true },
  );
  if (!queuedDocument) {
    throw new Error(`Document ${document._id} was not found while queuing.`);
  }

  try {
    await documentQueue.add(
      "process-document",
      {
        documentId: document._id.toString(),
        requestId,
      },
      { jobId: `${document._id.toString()}-${requestDate.getTime()}` },
    );

    return queuedDocument;
  } catch (error) {
    await Document.findOneAndUpdate(
      { _id: document._id, processingRequestedAt: requestDate },
      {
        $set: {
          status: "failed",
          processingError: "Document processing is temporarily unavailable. Please retry.",
        },
      },
    );
    throw error;
  }
}

async function retryDocumentProcessing({ documentId, userId } = {}) {
  const queue = getDocumentQueue();
  if (!queue) {
    const error = new Error("Document processing is temporarily unavailable.");
    error.status = 503;
    throw error;
  }

  const filter = {
    _id: documentId,
    status: { $in: ["uploaded", "failed"] },
  };
  if (userId) filter.userId = userId;

  // This state transition is the lock preventing duplicate retry jobs.
  const requestDate = new Date();
  const requestId = requestDate.toISOString();
  const document = await Document.findOneAndUpdate(
    filter,
    {
      $set: {
        status: "queued",
        processingError: null,
        processingRequestedAt: requestDate,
      },
    },
    { new: true },
  );

  if (!document) return null;

  try {
    await queue.add(
      "process-document",
      {
        documentId: document._id.toString(),
        requestId,
      },
      { jobId: `${document._id.toString()}-${requestDate.getTime()}` },
    );
    return document;
  } catch (error) {
    await Document.updateOne(
      { _id: document._id, status: "queued" },
      {
        $set: {
          status: "failed",
          processingRequestedAt: null,
          processingError: "The document could not be queued. Please try again.",
        },
      },
    );
    throw error;
  }
}

module.exports = {
  getDocumentQueue,
  enqueueDocumentProcessing,
  retryDocumentProcessing,
  closeDocumentQueue: async () => {
    if (!documentQueue) return;
    await documentQueue.close();
    documentQueue = undefined;
  },
};
