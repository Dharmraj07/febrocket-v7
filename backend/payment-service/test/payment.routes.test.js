process.env.NODE_ENV = "development";
process.env.JWT_ACCESS_SECRET = "payment-route-test-secret";
process.env.RAZORPAY_KEY_SECRET = "payment-signature-test-secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "payment-webhook-test-secret";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const test = require("node:test");
const { app } = require("../server");
const config = require("../config");
const Payment = require("../models/Payment");
const RazorpayWebhookEvent = require("../models/RazorpayWebhookEvent");

const server = app.listen(0);
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const token = jwt.sign({ id: "test-user" }, config.jwtAccessSecret);

test.after(() => {
  server.close();
});

test("payment routes require authentication", async () => {
  const response = await fetch(`${baseUrl}/api/payments/create-order`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount: 100 }),
  });

  assert.equal(response.status, 401);
});

test("order endpoint rejects amounts below 100 paise", async () => {
  const response = await fetch(`${baseUrl}/api/payments/create-order`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ amount: 99 }),
  });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).success, false);
});

test("verification requires all fields and rejects invalid signatures", async () => {
  const missing = await fetch(`${baseUrl}/api/payments/verify-payment`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });
  assert.equal(missing.status, 400);

  const invalid = await fetch(`${baseUrl}/api/payments/verify-payment`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      razorpay_order_id: "order_test",
      razorpay_payment_id: "pay_test",
      razorpay_signature: "invalid",
    }),
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).success, false);
});

test("verification accepts a matching HMAC-SHA256 signature", async () => {
  const payment = {
    razorpay_order_id: "order_test",
    razorpay_payment_id: "pay_test",
  };
  const signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${payment.razorpay_order_id}|${payment.razorpay_payment_id}`)
    .digest("hex");
  const response = await fetch(`${baseUrl}/api/payments/verify-payment`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...payment, razorpay_signature: signature }),
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
});

const signedWebhookRequest = (url, payload, eventId) => {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  return fetch(`${baseUrl}${url}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": signature,
      ...(eventId ? { "x-razorpay-event-id": eventId } : {}),
    },
    body: rawBody,
  });
};

test("Razorpay webhook verifies the raw body and stores a captured payment", async () => {
  const originalUpdate = Payment.findOneAndUpdate;
  const originalCreate = RazorpayWebhookEvent.create;
  let updates = 0;
  let savedEvent;

  Payment.findOneAndUpdate = async (filter, pipeline, options) => {
    updates += 1;
    assert.deepEqual(filter, { razorpayOrderId: "order_webhook_test" });
    assert.deepEqual(pipeline[0].$set.lastWebhookEvent, {
      $literal: "payment.captured",
    });
    assert.equal(options.upsert, true);
    return {};
  };
  RazorpayWebhookEvent.create = async (event) => {
    savedEvent = { ...event, status: "processing", save: async () => {} };
    return savedEvent;
  };

  try {
    const response = await signedWebhookRequest(
      "/api/payment/razorpay/webhook",
      {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_webhook_test",
              order_id: "order_webhook_test",
              amount: 100,
              currency: "INR",
            },
          },
        },
      },
      "evt_webhook_test"
    );

    assert.equal(response.status, 200);
    assert.equal(updates, 1);
    assert.equal(savedEvent.status, "processed");
  } finally {
    Payment.findOneAndUpdate = originalUpdate;
    RazorpayWebhookEvent.create = originalCreate;
  }
});

test("Razorpay webhook rejects invalid signatures and acknowledges unknown events", async () => {
  const invalid = await fetch(`${baseUrl}/api/payments/razorpay/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": "invalid",
    },
    body: JSON.stringify({ event: "payment.captured" }),
  });
  assert.equal(invalid.status, 400);

  const unknown = await signedWebhookRequest(
    "/api/payments/razorpay/webhook",
    { event: "payment.authorized" },
    "evt_unknown_test"
  );
  assert.equal(unknown.status, 200);
});

test("Razorpay webhook records failed payments and paid orders", async () => {
  const originalUpdate = Payment.findOneAndUpdate;
  const originalCreate = RazorpayWebhookEvent.create;
  const updates = [];
  Payment.findOneAndUpdate = async (filter, pipeline) => {
    updates.push({ filter, values: pipeline[0].$set });
    return {};
  };
  RazorpayWebhookEvent.create = async (event) => ({
    ...event,
    status: "processing",
    save: async () => {},
  });

  try {
    const failed = await signedWebhookRequest(
      "/api/payments/razorpay/webhook",
      {
        event: "payment.failed",
        payload: {
          payment: {
            entity: {
              id: "pay_failed_test",
              order_id: "order_failed_test",
              amount: 100,
              currency: "INR",
            },
          },
        },
      },
      "evt_failed_test"
    );
    const paid = await signedWebhookRequest(
      "/api/payments/razorpay/webhook",
      {
        event: "order.paid",
        payload: {
          order: {
            entity: {
              id: "order_paid_test",
              amount: 200,
              currency: "INR",
            },
          },
          payment: { entity: { id: "pay_paid_test" } },
        },
      },
      "evt_paid_test"
    );

    assert.equal(failed.status, 200);
    assert.equal(paid.status, 200);
    assert.deepEqual(updates.map(({ filter }) => filter.razorpayOrderId), [
      "order_failed_test",
      "order_paid_test",
    ]);
    assert.equal(updates[0].values.status.$cond[2].$literal, "failed");
    assert.equal(updates[1].values.status.$cond[2].$literal, "paid");
  } finally {
    Payment.findOneAndUpdate = originalUpdate;
    RazorpayWebhookEvent.create = originalCreate;
  }
});

test("Razorpay webhook rejects supported events missing required fields", async () => {
  const response = await signedWebhookRequest(
    "/api/payment/razorpay/webhook",
    { event: "payment.captured", payload: {} },
    "evt_missing_fields_test"
  );

  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /Missing required webhook fields/);
});

test("Razorpay webhook reports database failures without logging payment details", async () => {
  const originalUpdate = Payment.findOneAndUpdate;
  const originalCreate = RazorpayWebhookEvent.create;
  const originalConsoleError = console.error;
  const loggedErrors = [];
  Payment.findOneAndUpdate = async () => {
    throw new Error("sensitive payment details");
  };
  RazorpayWebhookEvent.create = async (event) => ({
    ...event,
    status: "processing",
    save: async () => {},
  });
  console.error = (...args) => loggedErrors.push(args);

  try {
    const response = await signedWebhookRequest(
      "/api/payment/razorpay/webhook",
      {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_webhook_test",
              order_id: "order_webhook_test",
              amount: 100,
              currency: "INR",
            },
          },
        },
      },
      "evt_database_failure_test"
    );

    assert.equal(response.status, 500);
    assert.deepEqual(loggedErrors, [
      ["Razorpay webhook database update failed:", "Error"],
    ]);
  } finally {
    Payment.findOneAndUpdate = originalUpdate;
    RazorpayWebhookEvent.create = originalCreate;
    console.error = originalConsoleError;
  }
});

test("Razorpay webhook does not update payment again for a processed event ID", async () => {
  const originalUpdate = Payment.findOneAndUpdate;
  const originalCreate = RazorpayWebhookEvent.create;
  const originalFindOne = RazorpayWebhookEvent.findOne;
  Payment.findOneAndUpdate = async () => {
    throw new Error("A processed duplicate must not update the payment.");
  };
  RazorpayWebhookEvent.create = async () => {
    const error = new Error("Duplicate event ID");
    error.code = 11000;
    throw error;
  };
  RazorpayWebhookEvent.findOne = async () => ({
    status: "processed",
    eventType: "payment.captured",
    razorpayOrderId: "order_webhook_test",
  });

  try {
    const response = await signedWebhookRequest(
      "/api/payments/razorpay/webhook",
      {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_webhook_test",
              order_id: "order_webhook_test",
              amount: 100,
              currency: "INR",
            },
          },
        },
      },
      "evt_webhook_test"
    );

    assert.equal(response.status, 200);
    assert.equal((await response.json()).duplicate, true);
  } finally {
    Payment.findOneAndUpdate = originalUpdate;
    RazorpayWebhookEvent.create = originalCreate;
    RazorpayWebhookEvent.findOne = originalFindOne;
  }
});

test("Razorpay webhook defers a duplicate while its first delivery is processing", async () => {
  const originalUpdate = Payment.findOneAndUpdate;
  const originalCreate = RazorpayWebhookEvent.create;
  const originalFindOne = RazorpayWebhookEvent.findOne;
  const originalClaim = RazorpayWebhookEvent.findOneAndUpdate;
  Payment.findOneAndUpdate = async () => {
    throw new Error("A concurrent duplicate must not update the payment.");
  };
  RazorpayWebhookEvent.create = async () => {
    const error = new Error("Duplicate event ID");
    error.code = 11000;
    throw error;
  };
  RazorpayWebhookEvent.findOne = async () => ({
    status: "processing",
    eventType: "payment.captured",
    razorpayOrderId: "order_webhook_test",
    processingStartedAt: new Date(),
  });
  RazorpayWebhookEvent.findOneAndUpdate = async () => {
    throw new Error("A live processing event must not be reclaimed.");
  };

  try {
    const response = await signedWebhookRequest(
      "/api/payments/razorpay/webhook",
      {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_webhook_test",
              order_id: "order_webhook_test",
              amount: 100,
              currency: "INR",
            },
          },
        },
      },
      "evt_webhook_test"
    );

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "30");
  } finally {
    Payment.findOneAndUpdate = originalUpdate;
    RazorpayWebhookEvent.create = originalCreate;
    RazorpayWebhookEvent.findOne = originalFindOne;
    RazorpayWebhookEvent.findOneAndUpdate = originalClaim;
  }
});
