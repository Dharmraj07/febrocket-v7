const { URL } = require("node:url");

function getRedisConnectionOptions(redisUrl = process.env.REDIS_URL) {
  if (!redisUrl || !String(redisUrl).trim()) {
    throw new Error("REDIS_URL must be configured for the processing worker.");
  }

  const url = new URL(redisUrl);
  const options = {
    host: url.hostname,
    port: Number(url.port || 6379),
    maxRetriesPerRequest: null,
  };

  if (url.username) options.username = decodeURIComponent(url.username);
  if (url.password) options.password = decodeURIComponent(url.password);
  if (url.protocol === "rediss:") options.tls = {};

  return options;
}

module.exports = { getRedisConnectionOptions };
