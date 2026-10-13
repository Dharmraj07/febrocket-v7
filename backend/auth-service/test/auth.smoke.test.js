const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const passport = require("passport");
const config = require("../config");
const { accessToken, refreshToken, hashToken, sessionRecord } = require("../controllers/authController");

require("../config/passport");

test("Passport registers local authentication strategies", () => {
  assert.ok(passport._strategy("local-login"));
  assert.ok(passport._strategy("local-register"));
});

test("token service creates verifiable access and refresh sessions", () => {
  const user = { _id: "507f1f77bcf86cd799439011", role: "user", email: "user@example.com", userName: "example" };
  const access = accessToken(user);
  const refresh = refreshToken(user);
  const payload = jwt.verify(refresh, config.jwtRefreshSecret);
  const record = sessionRecord(refresh, { headers: {}, ip: "127.0.0.1" });

  assert.equal(jwt.verify(access, config.jwtAccessSecret).email, user.email);
  assert.equal(record.jti, payload.jti);
  assert.equal(record.tokenHash, hashToken(refresh));
  assert.ok(record.expiresAt.getTime() <= payload.exp * 1000);
});

test("refresh-session expiry does not outlive a shorter JWT refresh expiry", () => {
  const user = { _id: "507f1f77bcf86cd799439011", role: "user", email: "user@example.com", userName: "example" };
  const refresh = jwt.sign(
    { ...user, jti: "short-session", type: "refresh" },
    config.jwtRefreshSecret,
    { expiresIn: "1h" },
  );
  const payload = jwt.verify(refresh, config.jwtRefreshSecret);
  const record = sessionRecord(refresh, { headers: {}, ip: "127.0.0.1" });

  assert.ok(record.expiresAt.getTime() <= payload.exp * 1000);
  assert.ok(
    record.expiresAt.getTime() <=
      record.createdAt.getTime() + config.refreshSessionTtlMs,
  );
});
