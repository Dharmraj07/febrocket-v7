const Redis = require("ioredis");

const redisUrl = process.env.REDIS_URL;
const client = redisUrl
  ? new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (attempt) => Math.min(attempt * 500, 30000),
    })
  : null;

if (client) {
  client.on("error", (error) => {
    console.error("Redis connection error:", error.message);
  });
}

const connectRedis = async () => {
  if (!client) {
    console.warn("REDIS_URL is not set. Redis-backed features will use local or MongoDB fallbacks.");
    return false;
  }

  if (client.status === "ready") return true;

  try {
    await client.connect();
    console.log("Redis connected successfully");
    return true;
  } catch (error) {
    console.error("Redis connection failed; continuing with fallbacks:", error.message);
    return false;
  }
};

const closeRedis = async () => {
  if (!client || client.status === "end") return;
  if (client.status === "ready") {
    await client.quit();
    return;
  }
  client.disconnect();
};

module.exports = { client, connectRedis, closeRedis };
