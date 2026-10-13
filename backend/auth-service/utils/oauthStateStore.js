const crypto = require("crypto");
const { redisCommand } = require("./redisStore");
const config = require("../config");

const consumeStateScript = `
  local value = redis.call("GET", KEYS[1])
  if value then redis.call("DEL", KEYS[1]) end
  return value
`;

const stores = new Map();

const createOAuthStateStore = (provider) => {
  const localStates = new Map();
  const keyFor = (state) => `oauth:state:${provider}:${state}`;
  const ttlSeconds = config.oauthStateTtlSeconds;

  return {
    store(_req, state, _meta, callback) {
      const handle = crypto.randomBytes(32).toString("hex");
      const value = JSON.stringify(state ?? null);
      const expiresAt = Date.now() + ttlSeconds * 1000;
      localStates.set(handle, { value, expiresAt });
      for (const [key, item] of localStates) {
        if (item.expiresAt <= Date.now()) localStates.delete(key);
      }

      redisCommand((redis) =>
        redis.set(keyFor(handle), value, "EX", ttlSeconds)
      ).then(() => callback(null, handle));
    },

    verify(_req, providedState, _meta, callback) {
      if (typeof providedState !== "string") {
        callback(null, false, { message: "Invalid authorization request state." });
        return;
      }

      redisCommand((redis) =>
        redis.eval(consumeStateScript, 1, keyFor(providedState))
      ).then((stored) => {
        const local = localStates.get(providedState);
        localStates.delete(providedState);
        const value =
          typeof stored === "string"
            ? stored
            : local?.expiresAt > Date.now()
              ? local.value
              : null;

        if (value === null) {
          callback(null, false, { message: "Unable to verify authorization request state." });
          return;
        }

        try {
          callback(null, true, JSON.parse(value));
        } catch (error) {
          callback(error);
        }
      });
    },
  };
};

const getOAuthStateStore = (provider) => {
  if (!stores.has(provider)) {
    stores.set(provider, createOAuthStateStore(provider));
  }
  return stores.get(provider);
};

module.exports = getOAuthStateStore;
