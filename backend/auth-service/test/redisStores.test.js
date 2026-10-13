const test = require("node:test");
const assert = require("node:assert/strict");
const getOAuthStateStore = require("../utils/oauthStateStore");
const { RedisRateLimitStore } = require("../middleware/rateLimiters");

const callbackResult = (invoke) =>
  new Promise((resolve, reject) => {
    invoke((error, ...result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });

test("OAuth state is one-time and works with the local fallback", async () => {
  const stateStore = getOAuthStateStore(`test-${Date.now()}`);
  const [handle] = await callbackResult((callback) =>
    stateStore.store({}, undefined, {}, callback)
  );

  const [valid, state] = await callbackResult((callback) =>
    stateStore.verify({}, handle, {}, callback)
  );
  assert.equal(valid, true);
  assert.equal(state, null);

  const [replayed] = await callbackResult((callback) =>
    stateStore.verify({}, handle, {}, callback)
  );
  assert.equal(replayed, false);
});

test("rate limiter tracks counts and resets the key", async () => {
  const store = new RedisRateLimitStore(`test-${Date.now()}`);
  store.init({ windowMs: 1000 });

  assert.equal((await store.increment("client")).totalHits, 1);
  assert.equal((await store.increment("client")).totalHits, 2);
  await store.resetKey("client");
  assert.equal((await store.increment("client")).totalHits, 1);
});
