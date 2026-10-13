const assert = require("node:assert/strict");
const http = require("node:http");
const { after, before, test } = require("node:test");

const collect = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
};

const listen = (server) =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });

const close = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

const request = (port, { method = "GET", path, headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const outgoing = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers,
      },
      async (incoming) => {
        const responseBody = await collect(incoming);
        resolve({
          status: incoming.statusCode,
          headers: incoming.headers,
          body: responseBody,
        });
      },
    );
    outgoing.once("error", reject);
    if (body) outgoing.write(body);
    outgoing.end();
  });

let authServer;
let documentServer;
let messageServer;
let paymentServer;
let gatewayServer;
let gatewayPort;
let delayedResponseTimer;

const serviceHandler = (serviceName) => async (req, res) => {
  if (req.url.endsWith("/slow-health")) return;

  if (req.url.endsWith("/drop")) {
    req.socket.destroy();
    return;
  }

  if (req.url.endsWith("/slow")) {
    delayedResponseTimer = setTimeout(() => {
      if (!res.destroyed) res.end("late response");
    }, 1000);
    return;
  }

  const body = await collect(req);
  if (req.url.endsWith("/upstream-error")) {
    res.writeHead(503, { "content-type": "application/json", "x-service": serviceName });
    res.end(JSON.stringify({ success: false, message: "service error" }));
    return;
  }

  if (req.url.endsWith("/redirect")) {
    res.writeHead(302, {
      location: "https://example.test/complete",
      "set-cookie": ["session=opaque; HttpOnly; Path=/"],
    });
    res.end();
    return;
  }

  res.writeHead(200, {
    "content-type": "application/json",
    "x-service": serviceName,
    "x-upstream-cors": "must-not-override-gateway",
  });
  res.end(
    JSON.stringify({
      service: serviceName,
      method: req.method,
      url: req.url,
      body: body.toString("base64"),
      authorization: req.headers.authorization,
      cookie: req.headers.cookie,
      contentType: req.headers["content-type"],
      customHeader: req.headers["x-custom-header"],
    }),
  );
};

before(async () => {
  authServer = http.createServer(serviceHandler("auth"));
  documentServer = http.createServer(serviceHandler("document"));
  messageServer = http.createServer(serviceHandler("message"));
  paymentServer = http.createServer(serviceHandler("payment"));
  const [authPort, documentPort, messagePort, paymentPort] = await Promise.all([
    listen(authServer),
    listen(documentServer),
    listen(messageServer),
    listen(paymentServer),
  ]);

  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${authPort}`;
  process.env.AUTH_SERVICE_HEALTH = `http://127.0.0.1:${authPort}/slow-health`;
  process.env.DOCUMENT_SERVICE_URL = `http://127.0.0.1:${documentPort}`;
  process.env.MESSAGE_SERVICE_URL = `http://127.0.0.1:${messagePort}`;
  process.env.PAYMENT_SERVICE_URL = `http://127.0.0.1:${paymentPort}`;
  process.env.CORS_ORIGIN = "http://localhost:3000";
  process.env.PROXY_TIMEOUT_MS = "500";

  const app = require("../server");
  gatewayServer = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => gatewayServer.once("listening", resolve));
  gatewayPort = gatewayServer.address().port;
});

after(async () => {
  clearTimeout(delayedResponseTimer);
  await Promise.all([
    close(gatewayServer),
    close(authServer),
    close(documentServer),
    close(messageServer),
    close(paymentServer),
  ]);
});

test("auth requests preserve path, query, headers, cookies, and multipart bytes", async () => {
  const boundary = "gateway-test-boundary";
  const multipartBody = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.txt"\r\nContent-Type: text/plain\r\n\r\nfile payload\r\n--${boundary}--\r\n`,
  );
  const response = await request(gatewayPort, {
    method: "POST",
    path: "/api/auth/upload?next=%2Fprofile&repeat=one&repeat=two",
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": multipartBody.length,
      authorization: "Bearer test-token",
      cookie: "refresh_token=opaque",
      "x-custom-header": "custom-value",
    },
    body: multipartBody,
  });

  const forwarded = JSON.parse(response.body);
  assert.equal(response.status, 200);
  assert.equal(forwarded.service, "auth");
  assert.equal(
    forwarded.url,
    "/api/auth/upload?next=%2Fprofile&repeat=one&repeat=two",
  );
  assert.equal(forwarded.body, multipartBody.toString("base64"));
  assert.equal(forwarded.authorization, "Bearer test-token");
  assert.equal(forwarded.cookie, "refresh_token=opaque");
  assert.equal(forwarded.contentType, `multipart/form-data; boundary=${boundary}`);
  assert.equal(forwarded.customHeader, "custom-value");
});

test("document requests reach the document service and keep JSON request bytes", async () => {
  const body = Buffer.from('{"title":"gateway payload"}');
  const response = await request(gatewayPort, {
    method: "PUT",
    path: "/api/documents/42?include=content",
    headers: {
      "content-type": "application/json",
      "content-length": body.length,
    },
    body,
  });

  const forwarded = JSON.parse(response.body);
  assert.equal(response.status, 200);
  assert.equal(forwarded.service, "document");
  assert.equal(forwarded.url, "/api/documents/42?include=content");
  assert.equal(forwarded.body, body.toString("base64"));
});

test("form mapping requests are routed through Document-Service", async () => {
  const body = Buffer.from(JSON.stringify({
    libraryId: "507f1f77bcf86cd799439011",
    website: { url: "https://example.gov.in/form", title: "Application" },
    fields: [],
  }));
  const response = await request(gatewayPort, {
    method: "POST",
    path: "/api/forms/map",
    headers: {
      "content-type": "application/json",
      "content-length": body.length,
      cookie: "access_token=opaque",
    },
    body,
  });

  test("form session lifecycle routes are proxied to Document-Service", async () => {
    for (const route of ["session", "analyze", "context", "resolve", "feedback"]) {
      const body = Buffer.from(JSON.stringify({ sessionId: "session-id" }));
      const response = await request(gatewayPort, {
        method: "POST",
        path: `/api/forms/${route}`,
        headers: {
          "content-type": "application/json",
          "content-length": body.length,
          cookie: "access_token=opaque",
        },
        body,
      });
      const forwarded = JSON.parse(response.body);
      assert.equal(response.status, 200, route);
      assert.equal(forwarded.service, "document", route);
      assert.equal(forwarded.url, `/api/forms/${route}`, route);
      assert.equal(forwarded.body, body.toString("base64"), route);
    }
  });

  const forwarded = JSON.parse(response.body);
  assert.equal(response.status, 200);
  assert.equal(forwarded.service, "document");
  assert.equal(forwarded.url, "/api/forms/map");
  assert.equal(forwarded.body, body.toString("base64"));
  assert.equal(forwarded.cookie, "access_token=opaque");
});

test("document library requests reach the document service", async () => {
  const body = Buffer.from('{"name":"Krishna Kumar Tudu"}');
  const response = await request(gatewayPort, {
    method: "POST",
    path: "/api/document-library/resolve?source=processing",
    headers: {
      "content-type": "application/json",
      "content-length": body.length,
      authorization: "Bearer test-token",
    },
    body,
  });

  const forwarded = JSON.parse(response.body);
  assert.equal(response.status, 200);
  assert.equal(forwarded.service, "document");
  assert.equal(forwarded.url, "/api/document-library/resolve?source=processing");
  assert.equal(forwarded.authorization, "Bearer test-token");
  assert.equal(forwarded.body, body.toString("base64"));
});

test("document data requests reach the document service", async () => {
  const response = await request(gatewayPort, {
    path: "/api/document-data/42?include=content",
  });

  const forwarded = JSON.parse(response.body);
  assert.equal(response.status, 200);
  assert.equal(forwarded.service, "document");
  assert.equal(forwarded.url, "/api/document-data/42?include=content");
});

test("message requests reach the message service", async () => {
  const response = await request(gatewayPort, {
    method: "POST",
    path: "/api/messages/conversations",
    headers: { "content-type": "application/json" },
    body: Buffer.from('{"text":"hello"}'),
  });

  const forwarded = JSON.parse(response.body);
  assert.equal(response.status, 200);
  assert.equal(forwarded.service, "message");
  assert.equal(forwarded.url, "/api/messages/conversations");
  assert.equal(forwarded.body, Buffer.from('{"text":"hello"}').toString("base64"));
});

test("payment requests reach the payment service with auth cookies", async () => {
  const body = Buffer.from('{"amount":100,"currency":"INR"}');
  const response = await request(gatewayPort, {
    method: "POST",
    path: "/api/payments/create-order",
    headers: {
      "content-type": "application/json",
      "content-length": body.length,
      authorization: "Bearer payment-token",
      cookie: "access_token=opaque",
    },
    body,
  });

  const forwarded = JSON.parse(response.body);
  assert.equal(response.status, 200);
  assert.equal(forwarded.service, "payment");
  assert.equal(forwarded.url, "/api/payments/create-order");
  assert.equal(forwarded.authorization, "Bearer payment-token");
  assert.equal(forwarded.cookie, "access_token=opaque");
  assert.equal(forwarded.body, body.toString("base64"));
});

test("singular payment webhook alias forwards the original raw request body", async () => {
  const body = Buffer.from('{"event":"payment.captured"}');
  const response = await request(gatewayPort, {
    method: "POST",
    path: "/api/payment/razorpay/webhook",
    headers: {
      "content-type": "application/json",
      "content-length": body.length,
      "x-razorpay-signature": "signature",
      "x-razorpay-event-id": "event-id",
    },
    body,
  });

  const forwarded = JSON.parse(response.body);
  assert.equal(response.status, 200);
  assert.equal(forwarded.service, "payment");
  assert.equal(forwarded.url, "/api/payment/razorpay/webhook");
  assert.equal(forwarded.body, body.toString("base64"));
  assert.equal(forwarded.customHeader, undefined);
});

test("service health checks return degraded instead of hanging indefinitely", async () => {
  const response = await request(gatewayPort, { path: "/api/auth/health" });

  assert.equal(response.status, 503);
  assert.deepEqual(JSON.parse(response.body), {
    status: "degraded",
    message: "Auth Service is unavailable",
  });
});

test("gateway CORS allows the configured frontend and requested headers", async () => {
  const response = await request(gatewayPort, {
    method: "OPTIONS",
    path: "/api/auth/login",
    headers: {
      origin: "http://localhost:3000",
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,x-custom-header",
    },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers["access-control-allow-origin"], "http://localhost:3000");
  assert.equal(response.headers["access-control-allow-credentials"], "true");
  assert.equal(
    response.headers["access-control-allow-headers"],
    "authorization,x-custom-header",
  );
});

test("downstream HTTP errors and redirects pass through unchanged", async () => {
  const errorResponse = await request(gatewayPort, {
    path: "/api/documents/upstream-error",
  });
  assert.equal(errorResponse.status, 503);
  assert.equal(errorResponse.headers["x-service"], "document");
  assert.deepEqual(JSON.parse(errorResponse.body), {
    success: false,
    message: "service error",
  });

  const redirectResponse = await request(gatewayPort, {
    path: "/api/auth/redirect",
  });
  assert.equal(redirectResponse.status, 302);
  assert.equal(redirectResponse.headers.location, "https://example.test/complete");
  assert.deepEqual(redirectResponse.headers["set-cookie"], [
    "session=opaque; HttpOnly; Path=/",
  ]);
});

test("unavailable and timed-out downstream services return gateway errors", async () => {
  const unavailable = await request(gatewayPort, { path: "/api/auth/drop" });
  assert.equal(unavailable.status, 502);
  assert.deepEqual(JSON.parse(unavailable.body), {
    success: false,
    message: "Auth service is unavailable",
  });

  const timeout = await request(gatewayPort, { path: "/api/documents/slow" });
  assert.equal(timeout.status, 504);
  assert.deepEqual(JSON.parse(timeout.body), {
    success: false,
    message: "Document service timed out",
  });
});
