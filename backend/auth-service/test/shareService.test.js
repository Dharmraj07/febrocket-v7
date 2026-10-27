const test = require("node:test");
const assert = require("node:assert/strict");
const { mock } = require("node:test");
const authController = require("../controllers/authController");
const User = require("../models/User");
const shareService = require("../service/shareService");
const {
  SHARE_CODE_ALPHABET,
  SHARE_CODE_LENGTH,
  generateShareCodeValue,
  normalizeShareCode,
  hashShareCode,
} = require("../service/shareService");

const makeRes = () => ({
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.payload = payload; return this; },
});

test("share codes are four-character uppercase codes from the allowed alphabet", () => {
  for (let index = 0; index < 25; index += 1) {
    const code = generateShareCodeValue();
    assert.equal(code.length, SHARE_CODE_LENGTH);
    assert.match(code, /^[0-9A-Z]{4}$/);
    assert.equal(code, code.toUpperCase());
    assert.equal(code.split("").every((char) => SHARE_CODE_ALPHABET.includes(char)), true);
  }
});

test("share code normalization is strict and consistent", () => {
  assert.equal(normalizeShareCode("a7k2"), "A7K2");
  assert.equal(normalizeShareCode(" A7K2 "), "A7K2");
  assert.equal(normalizeShareCode("abcd"), "ABCD");
  assert.equal(normalizeShareCode("ABCD1"), null);
  assert.equal(normalizeShareCode("AB!D"), null);
  assert.equal(normalizeShareCode(123), null);
});

test("share code hashing is deterministic and does not expose the raw code", () => {
  const code = "A7K2";
  const hash = hashShareCode(code);
  assert.equal(hash, hashShareCode(" a7k2 "));
  assert.equal(hash.length, 64);
  assert.notEqual(hash, code);
  assert.notEqual(hash, "A7K2");
});

test("redeeming a code replaces both users' prior connections with one-way access", async () => {
  const users = new Map([
    ["viewer", {
      _id: "viewer",
      connectedUserId: "previous-owner",
      connectionRole: "viewer",
    }],
    ["previous-owner", {
      _id: "previous-owner",
      connectedUserId: "viewer",
      connectionRole: "owner",
    }],
    ["owner", {
      _id: "owner",
      userName: "owner",
      profilePicture: null,
      connectedUserId: "previous-viewer",
      connectionRole: "owner",
      shareCodeHash: hashShareCode("A7K2"),
      shareCodeExpiresAt: new Date(Date.now() + 60_000),
    }],
    ["previous-viewer", {
      _id: "previous-viewer",
      connectedUserId: "owner",
      connectionRole: "viewer",
    }],
    ["legacy-owner", {
      _id: "legacy-owner",
      connectedUserId: "legacy-viewer",
    }],
    ["legacy-viewer", {
      _id: "legacy-viewer",
      connectedUserId: "legacy-owner",
    }],
  ]);
  const makeIdQuery = (id) => ({
    select: async () => users.get(String(id)) || null,
  });
  const makeCodeQuery = (filter) => ({
    select: () => ({
      limit: async () => [...users.values()]
        .filter((user) =>
          user.shareCodeHash === filter.shareCodeHash &&
          user.shareCodeExpiresAt > filter.shareCodeExpiresAt.$gt
        )
        .slice(0, 2),
    }),
  });
  const matchesConnection = (record, expected) =>
    expected === null
      ? record?.connectedUserId == null
      : String(record?.connectedUserId) === String(expected);

  const restoreFindById = mock.method(User, "findById", (id) => makeIdQuery(id));
  const restoreFind = mock.method(User, "find", (filter) => makeCodeQuery(filter));
  const restoreFindOneAndUpdate = mock.method(User, "findOneAndUpdate", async (filter, update) => {
    const user = users.get(String(filter._id));
    if (!user) return null;
    if ("shareCodeHash" in filter && user.shareCodeHash !== filter.shareCodeHash) return null;
    if (filter.shareCodeExpiresAt && user.shareCodeExpiresAt <= filter.shareCodeExpiresAt.$gt) return null;
    if ("connectedUserId" in filter && !matchesConnection(user, filter.connectedUserId)) return null;
    Object.assign(user, update.$set);
    return user;
  });
  const restoreUpdateOne = mock.method(User, "updateOne", async (filter, update) => {
    const user = users.get(String(filter._id));
    if (
      user &&
      (!("connectedUserId" in filter) || matchesConnection(user, filter.connectedUserId)) &&
      (!("connectionRole" in filter) || user.connectionRole === filter.connectionRole)
    ) {
      Object.assign(user, update.$set);
    }
    return { modifiedCount: user ? 1 : 0 };
  });

  try {
    const result = await shareService.connectWithCode("viewer", "A7K2");
    assert.equal(result.role, "viewer");
    assert.equal(result.user.id, "owner");
    assert.equal(users.get("viewer").connectedUserId, "owner");
    assert.equal(users.get("viewer").connectionRole, "viewer");
    assert.equal(users.get("owner").connectedUserId, "viewer");
    assert.equal(users.get("owner").connectionRole, "owner");
    assert.equal(users.get("previous-owner").connectedUserId, null);
    assert.equal(users.get("previous-viewer").connectedUserId, null);
    assert.equal(users.get("owner").shareCodeHash, null);

    const viewerConnection = await shareService.getConnectionForUser("viewer");
    assert.equal(viewerConnection.connected, true);
    assert.equal(viewerConnection.role, "viewer");
    assert.equal(viewerConnection.user.id, "owner");
    const ownerConnection = await shareService.getConnectionForUser("owner");
    assert.equal(ownerConnection.connected, true);
    assert.equal(ownerConnection.role, "owner");
    assert.equal(ownerConnection.user.id, "viewer");
    const legacyConnection = await shareService.getConnectionForUser("legacy-owner");
    assert.equal(legacyConnection.connected, false);
    assert.equal(users.get("legacy-owner").connectedUserId, null);
    assert.equal(users.get("legacy-viewer").connectedUserId, null);

    await assert.rejects(
      shareService.connectWithCode("previous-viewer", "A7K2"),
      /Invalid or expired sharing code/,
    );

    await shareService.disconnectConnectionForUser("owner");
    assert.equal(users.get("owner").connectedUserId, null);
    assert.equal(users.get("viewer").connectedUserId, null);
  } finally {
    restoreFindById.mock.restore();
    restoreFind.mock.restore();
    restoreFindOneAndUpdate.mock.restore();
    restoreUpdateOne.mock.restore();
  }
});

test("share routes respond with success payloads for generation, lookup, disconnect, and cancellation", async () => {
  const restoreGenerate = mock.method(require("../service/shareService"), "generateShareCodeForUser", async () => ({
    code: "A7K2",
    expiresAt: new Date("2026-10-22T10:30:00.000Z"),
  }));
  const restoreConnect = mock.method(require("../service/shareService"), "connectWithCode", async () => ({
    user: { id: "user-2", userName: "second", profilePicture: null },
    role: "viewer",
  }));
  const restoreGet = mock.method(require("../service/shareService"), "getConnectionForUser", async () => ({
    connected: true,
    user: { id: "user-2", userName: "second", profilePicture: null },
    role: "viewer",
  }));
  const restoreDisconnect = mock.method(require("../service/shareService"), "disconnectConnectionForUser", async () => {});
  const restoreCancel = mock.method(require("../service/shareService"), "clearShareCodeFields", async () => {});

  try {
    const genRes = makeRes();
    await authController.generateShareCode({ user: { id: "user-1" } }, genRes);
    assert.equal(genRes.statusCode, 200);
    assert.equal(genRes.payload.success, true);
    assert.equal(genRes.payload.data.code, "A7K2");

    const conRes = makeRes();
    await authController.connectWithShareCode({ user: { id: "user-1" }, body: { code: "a7k2" } }, conRes);
    assert.equal(conRes.statusCode, 200);
    assert.equal(conRes.payload.data.user.userName, "second");
    assert.equal(conRes.payload.data.role, "viewer");

    const getRes = makeRes();
    await authController.getCurrentConnection({ user: { id: "user-1" } }, getRes);
    assert.equal(getRes.payload.data.connected, true);
    assert.equal(getRes.payload.data.role, "viewer");

    const delRes = makeRes();
    await authController.disconnectConnection({ user: { id: "user-1" } }, delRes);
    assert.equal(delRes.payload.message, "Disconnected successfully");

    const cancelRes = makeRes();
    await authController.cancelShareCode({ user: { id: "user-1" } }, cancelRes);
    assert.equal(cancelRes.payload.message, "Sharing code cancelled successfully");
  } finally {
    restoreGenerate();
    restoreConnect();
    restoreGet();
    restoreDisconnect();
    restoreCancel();
  }
});
