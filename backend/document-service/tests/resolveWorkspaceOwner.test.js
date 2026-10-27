const test = require("node:test");
const assert = require("node:assert/strict");
const { mock } = require("node:test");
const axios = require("axios");
const resolveWorkspaceOwner = require("../middleware/resolveWorkspaceOwner");

const currentUserId = "0123456789abcdef01234567";
const connectedUserId = "abcdef0123456789abcdef01";

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("workspace owner defaults to the authenticated account without an auth-service lookup", async () => {
  const response = createResponse();
  let nextCalled = false;

  await resolveWorkspaceOwner(
    { user: { id: currentUserId }, query: {}, headers: {} },
    response,
    () => { nextCalled = true; },
  );

  assert.equal(nextCalled, true);
  assert.equal(response.statusCode, null);
});

test("connected workspace owner is accepted only from the authenticated connection response", async () => {
  const restoreGet = mock.method(axios, "get", async () => ({
    data: {
      data: {
        connected: true,
        role: "viewer",
        user: { id: connectedUserId, userName: "connected" },
      },
    },
  }));
  const response = createResponse();
  const req = {
    user: { id: currentUserId },
    query: { ownerId: connectedUserId },
    headers: {
      authorization: "Bearer session-token",
      cookie: "access_token=session-cookie",
    },
  };
  let nextCalled = false;

  try {
    await resolveWorkspaceOwner(req, response, () => { nextCalled = true; });
    const [url, options] = restoreGet.mock.calls[0].arguments;
    assert.match(url, /\/api\/auth\/share\/connection$/);
    assert.deepEqual(options.headers, {
      authorization: "Bearer session-token",
      cookie: "access_token=session-cookie",
    });
    assert.equal(req.workspaceOwnerId, connectedUserId);
    assert.equal(req.isConnectedWorkspace, true);
    assert.equal(nextCalled, true);
    assert.equal(response.statusCode, null);
  } finally {
    restoreGet.mock.restore();
  }
});

test("an account that is not the current connection is rejected", async () => {
  const restoreGet = mock.method(axios, "get", async () => ({
    data: {
      data: {
        connected: true,
        user: { id: currentUserId, userName: "self" },
      },
    },
  }));
  const response = createResponse();
  let nextCalled = false;

  try {
    await resolveWorkspaceOwner(
      {
        user: { id: currentUserId },
        query: { ownerId: connectedUserId },
        headers: {},
      },
      response,
      () => { nextCalled = true; },
    );
    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.message, "This account is not connected to yours.");
  } finally {
    restoreGet.mock.restore();
  }
});

test("the connected account cannot access a viewer's private workspace", async () => {
  const restoreGet = mock.method(axios, "get", async () => ({
    data: {
      data: {
        connected: true,
        role: "owner",
        user: { id: connectedUserId, userName: "viewer" },
      },
    },
  }));
  const response = createResponse();
  let nextCalled = false;

  try {
    await resolveWorkspaceOwner(
      {
        user: { id: currentUserId },
        query: { ownerId: connectedUserId },
        headers: {},
      },
      response,
      () => { nextCalled = true; },
    );
    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.message, "This account is not connected to yours.");
  } finally {
    restoreGet.mock.restore();
  }
});

test("auth-service outages fail closed for connected workspace access", async () => {
  const restoreGet = mock.method(axios, "get", () => {
    throw new Error("connection refused");
  });
  const response = createResponse();

  try {
    await resolveWorkspaceOwner(
      {
        user: { id: currentUserId },
        query: { ownerId: connectedUserId },
        headers: {},
      },
      response,
      () => assert.fail("next must not run if access cannot be verified"),
    );
    assert.equal(response.statusCode, 503);
    assert.equal(
      response.body.message,
      "Connected account access could not be verified. Please try again.",
    );
  } finally {
    restoreGet.mock.restore();
  }
});
