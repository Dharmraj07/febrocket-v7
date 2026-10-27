import test from "node:test";
import assert from "node:assert/strict";
import { api, isAbortError } from "./api.js";

test("requests with separate abort signals are not deduplicated", async () => {
  const firstController = new AbortController();
  const secondController = new AbortController();
  const adapter = (config) =>
    Promise.resolve({
      data: "ok",
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    });

  const firstRequest = api.get("/api/documents", {
    params: { page: 1 },
    signal: firstController.signal,
    adapter,
  });
  const secondRequest = api.get("/api/documents", {
    params: { page: 1 },
    signal: secondController.signal,
    adapter,
  });

  assert.notEqual(firstRequest, secondRequest);
  firstController.abort();
  await assert.rejects(firstRequest, isAbortError);
  assert.equal((await secondRequest).data, "ok");
});

test("a protected request refreshes once and retries after an expired access token", async () => {
  const interceptor = api.interceptors.response.handlers[0].rejected;
  const originalPost = api.post;
  const originalRequest = api.request;
  const refreshCalls = [];
  const retriedRequests = [];
  api.post = async (...args) => {
    refreshCalls.push(args);
    return { data: { success: true } };
  };
  api.request = async (request) => {
    retriedRequests.push(request);
    return { status: 200, data: { success: true } };
  };

  try {
    const request = {
      url: "/api/document-library",
      method: "get",
      withCredentials: true,
    };
    const response = await interceptor({
      config: request,
      response: { status: 401 },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(refreshCalls, [
      ["/api/auth/refresh", {}, { withCredentials: true }],
    ]);
    assert.equal(retriedRequests.length, 1);
    assert.equal(retriedRequests[0]._authRetry, true);
  } finally {
    api.post = originalPost;
    api.request = originalRequest;
  }
});

test("refresh failures reject the original unauthorized request without retrying it", async () => {
  const interceptor = api.interceptors.response.handlers[0].rejected;
  const originalPost = api.post;
  const originalRequest = api.request;
  const unauthorizedError = {
    config: { url: "/api/document-library", method: "get" },
    response: { status: 401 },
  };
  let retried = false;
  api.post = async () => {
    throw new Error("Refresh unavailable");
  };
  api.request = async () => {
    retried = true;
  };

  try {
    await assert.rejects(interceptor(unauthorizedError), (error) => {
      assert.equal(error, unauthorizedError);
      return true;
    });
    assert.equal(retried, false);
  } finally {
    api.post = originalPost;
    api.request = originalRequest;
  }
});
