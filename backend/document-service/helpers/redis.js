const { URL } = require("url");

function hasRedisConfig(redisUrl = process.env.REDIS_URL) {
  return Boolean(redisUrl && String(redisUrl).trim());
}

function getRedisConnectionOptions(redisUrl = process.env.REDIS_URL) {
  if (!hasRedisConfig(redisUrl)) {
    return null;
  }

  const url = new URL(redisUrl);
  const options = {
    host: url.hostname,
    port: Number(url.port || 6379),
    maxRetriesPerRequest: null,
  };

  if (url.username) {
    options.username = decodeURIComponent(url.username);
  }

  if (url.password) {
    options.password = decodeURIComponent(url.password);
  }

  if (url.protocol === "rediss:") {
    options.tls = {};
  }

  return options;
}

module.exports = {
  hasRedisConfig,
  getRedisConnectionOptions,
};
