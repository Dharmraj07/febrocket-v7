const Redis = require("ioredis");
const { getRedisConnectionOptions, hasRedisConfig } = require("../helpers/redis");

const CHANNEL = "febrocket:document-processing-events";
let publisher;

function createRedisClient() {
  const connection = getRedisConnectionOptions();
  if (!connection) {
    throw new Error("REDIS_URL is required for document processing events.");
  }
  return new Redis(connection, {
    maxRetriesPerRequest: null,
    commandTimeout: 5000,
  });
}

function getPublisher() {
  if (!hasRedisConfig()) {
    throw new Error("REDIS_URL is required for document processing events.");
  }

  if (!publisher) {
    publisher = createRedisClient();
    publisher.on("error", (error) => {
      console.error("Document processing event publisher error:", error.message);
    });
  }
  return publisher;
}

async function publishDocumentStatus({
  userId,
  documentId,
  requestId,
  status,
  processingError,
}) {
  const event = {
    eventId: `${documentId}:${requestId}:${status}`,
    userId: String(userId),
    documentId: String(documentId),
    requestId,
    status,
    processingError: processingError || null,
  };
  await getPublisher().publish(CHANNEL, JSON.stringify(event));
  return event;
}

const { EventEmitter } = require("events");
const eventBus = new EventEmitter();
eventBus.setMaxListeners(0);
let sharedSubscriber;
let subscriberConnecting = null;

function getSharedSubscriber() {
  if (sharedSubscriber) return Promise.resolve(sharedSubscriber);
  if (subscriberConnecting) return subscriberConnecting;

  subscriberConnecting = (async () => {
    const client = createRedisClient();
    client.on("error", (error) => {
      console.error("Document processing event subscriber error:", error.message);
    });
    client.on("message", (_channel, message) => {
      try {
        const parsed = JSON.parse(message);
        eventBus.emit("status", parsed);
      } catch (error) {
        console.error("Invalid document processing event received:", error.message);
      }
    });

    try {
      await client.subscribe(CHANNEL);
      sharedSubscriber = client;
      return sharedSubscriber;
    } catch (err) {
      client.disconnect();
      throw err;
    } finally {
      subscriberConnecting = null;
    }
  })();

  return subscriberConnecting;
}

async function subscribeToDocumentStatus(onStatus) {
  if (!hasRedisConfig()) {
    throw new Error("REDIS_URL is required for document processing events.");
  }

  await getSharedSubscriber();
  eventBus.on("status", onStatus);

  let closed = false;
  return async () => {
    if (closed) return;
    closed = true;
    eventBus.off("status", onStatus);
  };
}

async function closeDocumentProcessingEvents() {
  if (publisher) {
    const currentPublisher = publisher;
    publisher = null;
    try {
      await currentPublisher.quit();
    } catch {
      currentPublisher.disconnect();
    }
  }

  if (sharedSubscriber) {
    const currentSubscriber = sharedSubscriber;
    sharedSubscriber = null;
    try {
      await currentSubscriber.quit();
    } catch {
      currentSubscriber.disconnect();
    }
  }
}

module.exports = {
  publishDocumentStatus,
  subscribeToDocumentStatus,
  closeDocumentProcessingEvents,
};
