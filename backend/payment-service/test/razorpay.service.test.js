process.env.RAZORPAY_KEY_ID = "rzp_test_unit";
process.env.RAZORPAY_KEY_SECRET = "unit-test-secret";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const {
  validateOrderRequest,
  verifyPaymentSignature,
} = require("../services/razorpay.service");

test("order requests require at least 100 integer paise in INR", () => {
  assert.doesNotThrow(() => validateOrderRequest({ amount: 100 }));
  assert.throws(
    () => validateOrderRequest({ amount: 99 }),
    { statusCode: 400, message: "Amount must be an integer of at least 100 paise." }
  );
  assert.throws(() => validateOrderRequest({ amount: 100.5 }), { statusCode: 400 });
  assert.throws(
    () => validateOrderRequest({ amount: 100, currency: "USD" }),
    { statusCode: 400 }
  );
});

test("payment signatures use the Razorpay HMAC-SHA256 format", () => {
  const payment = {
    razorpay_order_id: "order_test123",
    razorpay_payment_id: "pay_test123",
  };
  const signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${payment.razorpay_order_id}|${payment.razorpay_payment_id}`)
    .digest("hex");

  assert.equal(verifyPaymentSignature({ ...payment, razorpay_signature: signature }), true);
  assert.equal(
    verifyPaymentSignature({ ...payment, razorpay_signature: `${signature.slice(0, -1)}0` }),
    false
  );
  assert.equal(verifyPaymentSignature({ ...payment, razorpay_signature: "not-a-signature" }), false);
});
