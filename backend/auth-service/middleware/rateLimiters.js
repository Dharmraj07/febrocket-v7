const rateLimit = require("express-rate-limit");
const config = require("../config");
const { redisCommand } = require("../utils/redisStore");

const incrementScript = `
  local hits = redis.call("INCR", KEYS[1])
  if hits == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
  local ttl = redis.call("PTTL", KEYS[1])
  return { hits, ttl }
`;

const decrementScript = `
  local hits = redis.call("DECR", KEYS[1])
  if hits <= 0 then
    redis.call("DEL", KEYS[1])
    return 0
  end
  return hits
`;

class RedisRateLimitStore {
  constructor(type) {
    this.type = type;
    this.localHits = new Map();
    this.windowMs = config.rateLimitWindowMs;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  keyFor(key) {
    return `rate-limit:${this.type}:${encodeURIComponent(key)}`;
  }

  async increment(key) {
    const redisResult = await redisCommand((redis) =>
      redis.eval(incrementScript, 1, this.keyFor(key), this.windowMs)
    );
    if (Array.isArray(redisResult)) {
      const [totalHits, ttl] = redisResult.map(Number);
      return {
        totalHits,
        resetTime: new Date(Date.now() + Math.max(ttl, 0)),
      };
    }

    const now = Date.now();
    for (const [localKey, entry] of this.localHits) {
      if (entry.resetAt <= now) this.localHits.delete(localKey);
    }

    let entry = this.localHits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { totalHits: 0, resetAt: now + this.windowMs };
      this.localHits.set(key, entry);
    }
    entry.totalHits += 1;
    return { totalHits: entry.totalHits, resetTime: new Date(entry.resetAt) };
  }

  async decrement(key) {
    const result = await redisCommand((redis) =>
      redis.eval(decrementScript, 1, this.keyFor(key))
    );
    if (result !== undefined) return;

    const entry = this.localHits.get(key);
    if (!entry) return;
    entry.totalHits -= 1;
    if (entry.totalHits <= 0) this.localHits.delete(key);
  }

  async resetKey(key) {
    await redisCommand((redis) => redis.del(this.keyFor(key)));
    this.localHits.delete(key);
  }
}

const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "127.0.0.1";
};

const commonOptions = {
  windowMs: config.rateLimitWindowMs,
  standardHeaders: "draft-7",
  legacyHeaders: false,
};

const authLimiter = rateLimit({
  ...commonOptions,
  limit: config.rateLimitMax,
  store: new RedisRateLimitStore("auth"),
  keyGenerator: (req) => getClientIp(req),
  message: {
    success: false,
    message: "Too many authentication requests. Please try again later.",
  },
});

const passwordLimiter = rateLimit({
  ...commonOptions,
  limit: config.passwordRateLimitMax,
  store: new RedisRateLimitStore("password"),
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    const email = (req.body?.email || req.query?.email || "").toLowerCase().trim();
    return email ? `${ip}:${email}` : ip;
  },
  message: {
    success: false,
    message: "Too many password requests. Please try again later.",
  },
});

const shareCodeLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 1000,
  limit: 10,
  store: new RedisRateLimitStore("share-code"),
  keyGenerator: (req) => `${req.user?.id || "anonymous"}:${getClientIp(req)}`,
  message: {
    success: false,
    message: "Too many sharing-code requests. Please try again later.",
  },
});

const shareVerificationLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 1000,
  limit: 12,
  store: new RedisRateLimitStore("share-verify"),
  keyGenerator: (req) => `${req.user?.id || "anonymous"}:${getClientIp(req)}`,
  message: {
    success: false,
    message: "Too many connection attempts. Please try again later.",
  },
});

module.exports = {
  authLimiter,
  passwordLimiter,
  shareCodeLimiter,
  shareVerificationLimiter,
  RedisRateLimitStore,
};
