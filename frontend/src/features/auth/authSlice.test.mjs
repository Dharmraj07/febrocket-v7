import test from "node:test";
import assert from "node:assert/strict";

import { configureStore } from "@reduxjs/toolkit";
import { api } from "../../lib/api.js";
import authReducer, {
  checkAuthSession,
  logoutUser,
} from "./authSlice.js";

function createTestStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
    },
  });
}

test("checkAuthSession loads a user into Redux state", async () => {
  const originalGet = api.get;
  api.get = async () => ({
    data: {
      data: {
        user: { userName: "Ada" },
      },
    },
  });

  try {
    const store = createTestStore();
    await store.dispatch(checkAuthSession()).unwrap();

    assert.deepEqual(store.getState().auth, {
      user: { userName: "Ada" },
      authChecked: true,
      authCheckStatus: null,
      isLoading: false,
      error: null,
      message: null,
    });
  } finally {
    api.get = originalGet;
  }
});

test("checkAuthSession clears auth state when no user is returned", async () => {
  const originalGet = api.get;
  api.get = async () => ({ data: {} });

  try {
    const store = createTestStore();
    await assert.rejects(store.dispatch(checkAuthSession()).unwrap(), {
      message: "Authenticated user was not returned.",
    });

    assert.equal(store.getState().auth.user, null);
    assert.equal(store.getState().auth.authChecked, true);
    assert.equal(store.getState().auth.isLoading, false);
    assert.equal(
      store.getState().auth.error,
      "Authenticated user was not returned."
    );
  } finally {
    api.get = originalGet;
  }
});

test("checkAuthSession exposes a retryable message instead of a raw network error", async () => {
  const originalGet = api.get;
  api.get = async () => {
    const error = new Error("ECONNRESET mongodb://internal.example/private");
    error.code = "ECONNRESET";
    error.request = {};
    throw error;
  };

  try {
    const store = createTestStore();
    await assert.rejects(store.dispatch(checkAuthSession()).unwrap());

    assert.equal(store.getState().auth.authCheckStatus, "transient");
    assert.equal(
      store.getState().auth.error,
      "Connection problem. Check your network and try again."
    );
    assert.equal(store.getState().auth.error.includes("mongodb"), false);
  } finally {
    api.get = originalGet;
  }
});

test("logoutUser clears the authenticated user after a successful request", async () => {
  const originalPost = api.post;
  let request;
  api.post = async (...args) => {
    request = args;
  };

  try {
    const store = createTestStore();
    store.dispatch({
      type: "auth/checkAuthSession/fulfilled",
      payload: { userName: "Ada" },
    });

    await store.dispatch(logoutUser()).unwrap();

    assert.deepEqual(request, [
      "/api/auth/logout",
      {},
      { withCredentials: true },
    ]);
    assert.equal(store.getState().auth.user, null);
    assert.equal(store.getState().auth.isLoading, false);
  } finally {
    api.post = originalPost;
  }
});
