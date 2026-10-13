const { client } = require("../config/redis");

let lastFailureLogAt = 0;

const redisCommand = async (command) => {
  if (!client || client.status !== "ready") return undefined;

  try {
    return await command(client);
  } catch (error) {
    const now = Date.now();
    if (now - lastFailureLogAt > 60000) {
      console.error("Redis operation failed; using fallback:", error.message);
      lastFailureLogAt = now;
    }
    return undefined;
  }
};

const getUserCache = async (userId) => {
  const serialized = await redisCommand((redis) => redis.get(`user:${userId}`));
  if (serialized === undefined) return undefined;
  if (serialized === null) return null;

  try {
    const user = JSON.parse(serialized);
    return (
      user &&
      user.id === userId &&
      typeof user.role === "string" &&
      Object.prototype.hasOwnProperty.call(user, "profilePicture")
    )
      ? user
      : null;
  } catch (error) {
    console.error("Invalid user cache entry:", error.message);
    return null;
  }
};

const setUserCache = (userId, user, ttlSeconds) =>
  redisCommand((redis) =>
    redis.set(`user:${userId}`, JSON.stringify(user), "EX", ttlSeconds)
  );

const invalidateUserCache = (userId) =>
  redisCommand((redis) => redis.del(`user:${userId}`));

const getSessionState = (sessionId) =>
  redisCommand((redis) => redis.get(`session:${sessionId}`));

const setSessionState = (sessionId, state, ttlMs) => {
  if (ttlMs <= 0) return Promise.resolve(undefined);
  return redisCommand((redis) =>
    redis.set(`session:${sessionId}`, state, "PX", Math.ceil(ttlMs))
  );
};

const setOtp = (email, hash, ttlMs) =>
  redisCommand((redis) =>
    redis.set(`otp:${email}`, hash, "PX", Math.ceil(ttlMs))
  );

const getOtp = (email) =>
  redisCommand((redis) => redis.get(`otp:${email}`));

const deleteOtp = (email) =>
  redisCommand((redis) => redis.del(`otp:${email}`));

module.exports = {
  client,
  redisCommand,
  getUserCache,
  setUserCache,
  invalidateUserCache,
  getSessionState,
  setSessionState,
  setOtp,
  getOtp,
  deleteOtp,
};
