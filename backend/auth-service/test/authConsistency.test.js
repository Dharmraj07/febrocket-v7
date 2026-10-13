const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../models/User");
const validators = require("../validation/authValidators");
const { pruneExpiredSessions } = require("../service/authService");
const { publicUser } = require("../utils/authHelpers");
const {
  getGoogleProfilePictureUrl,
  isGoogleProfilePictureUrl,
} = require("../utils/profilePicture");

test("registration email validation accepts plus-addresses accepted by the model", async () => {
  const email = "person+tag@example.com";
  assert.equal(
    validators.register.safeParse({
      userName: "person",
      email,
      password: "Password123!",
    }).success,
    true,
  );

  const user = new User({
    userName: "person",
    email,
    password: "Password123!",
  });
  await assert.doesNotReject(user.validate());
});

test("admin update validation matches persisted username and boolean types", () => {
  assert.equal(
    validators.adminUpdateUser.safeParse({ userName: "ab" }).success,
    false,
  );
  assert.equal(
    validators.adminUpdateUser.safeParse({ isVerified: "false" }).success,
    false,
  );
  assert.deepEqual(
    validators.adminUpdateUser.parse({ isVerified: false }),
    { isVerified: false },
  );
});

test("session cleanup removes expired sessions but retains unexpired revoked records", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const sessions = [
    { jti: "expired-active", expiresAt: new Date(now.getTime() - 1) },
    { jti: "expired-revoked", revokedAt: now, expiresAt: new Date(now.getTime() - 1) },
    { jti: "active", expiresAt: new Date(now.getTime() + 1) },
    { jti: "revoked", revokedAt: now, expiresAt: new Date(now.getTime() + 1) },
  ];

  assert.deepEqual(
    pruneExpiredSessions(sessions, now).map((session) => session.jti),
    ["active", "revoked"],
  );
});

test("Google profile pictures accept only HTTPS Google-hosted image URLs", () => {
  const profilePicture = "https://lh3.googleusercontent.com/a/profile";
  assert.equal(
    getGoogleProfilePictureUrl({ photos: [{ value: profilePicture }] }),
    profilePicture,
  );
  assert.equal(
    getGoogleProfilePictureUrl({ _json: { picture: profilePicture } }),
    profilePicture,
  );
  assert.equal(
    getGoogleProfilePictureUrl({
      _json: { image: { url: profilePicture } },
    }),
    profilePicture,
  );
  assert.equal(
    getGoogleProfilePictureUrl({
      photos: [{ value: "https://attacker.example/profile" }],
      picture: profilePicture,
    }),
    profilePicture,
  );
  assert.equal(
    getGoogleProfilePictureUrl({
      photos: [{ value: "http://lh3.googleusercontent.com/profile" }],
    }),
    null,
  );
  assert.equal(
    getGoogleProfilePictureUrl({
      photos: [{ value: "https://attacker.example/profile" }],
    }),
    null,
  );
  assert.equal(isGoogleProfilePictureUrl("https://googleusercontent.com/a"), true);
  assert.equal(isGoogleProfilePictureUrl("https://googleusercontent.com.evil/a"), false);
});

test("user model validates stored profile picture URLs", async () => {
  const user = new User({
    userName: "person",
    email: "person@example.com",
    password: "Password123!",
    profilePicture: "https://lh3.googleusercontent.com/a/profile",
  });
  await assert.doesNotReject(user.validate());

  user.profilePicture = "javascript:alert(1)";
  await assert.rejects(user.validate());
});

test("public auth user responses include the profile picture without private fields", () => {
  const user = publicUser({
    _id: "507f1f77bcf86cd799439011",
    email: "person@example.com",
    role: "user",
    userName: "person",
    profilePicture: "https://lh3.googleusercontent.com/a/profile",
    isVerified: true,
    password: "never-return-this",
  });

  assert.equal(user.profilePicture, "https://lh3.googleusercontent.com/a/profile");
  assert.equal("password" in user, false);
});
