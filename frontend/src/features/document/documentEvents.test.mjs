import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../../lib/api.js";
import { subscribeToDocumentProcessingEvents } from "./documentEvents.js";

test("processing event subscriptions use authenticated SSE and deduplicate deliveries", async () => {
  const originalEventSource = globalThis.EventSource;
  const originalGet = api.get;
  const opened = [];
  const received = [];
  const authChecks = [];

  class FakeEventSource {
    static instance;

    constructor(url, options) {
      this.url = String(url);
      this.options = options;
      this.listeners = {};
      FakeEventSource.instance = this;
    }

    addEventListener(name, listener) {
      this.listeners[name] = listener;
    }

    close() {
      this.closed = true;
    }
  }
  globalThis.EventSource = FakeEventSource;
  api.get = async (...args) => {
    authChecks.push(args);
    return { data: { success: true } };
  };

  try {
    const unsubscribe = subscribeToDocumentProcessingEvents({
      onOpen: () => opened.push(true),
      onEvent: (event) => received.push(event),
    });
    const source = FakeEventSource.instance;
    source.onopen();
    const event = {
      eventId: "document-1:request-1:processed",
      documentId: "document-1",
      userId: "user-1",
      status: "processed",
    };
    source.listeners["document-status"]({ data: JSON.stringify(event) });
    source.listeners["document-status"]({ data: JSON.stringify(event) });
    source.onerror();
    source.onerror();
    await new Promise((resolve) => setImmediate(resolve));
    unsubscribe();

    assert.equal(new URL(source.url).pathname, "/api/documents/events");
    assert.equal(
      new URL(source.url).origin,
      new URL(api.defaults.baseURL || globalThis.location.origin).origin
    );
    assert.deepEqual(source.options, { withCredentials: true });
    assert.deepEqual(opened, [true]);
    assert.deepEqual(received, [event]);
    assert.equal(authChecks.length, 1);
    assert.equal(authChecks[0][0], "/api/auth/session");
    assert.equal(source.closed, true);
  } finally {
    globalThis.EventSource = originalEventSource;
    api.get = originalGet;
  }
});
