# Payment Service

This service creates Razorpay orders, verifies Standard Checkout signatures,
and records payment status from signed Razorpay webhooks.

## Configure and run locally

Install dependencies, then copy `.env.example` to `.env` if no local `.env`
exists. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
`RAZORPAY_WEBHOOK_SECRET`, `MONGO_URI`, and the same `JWT_ACCESS_SECRET` used
by the auth service. Set the webhook secret to the secret configured for the
webhook in the Razorpay Dashboard; it is separate from `RAZORPAY_KEY_SECRET`.
The local frontend origin defaults to `http://localhost:3000`; the service
listens on port `3004`.

Configure the API gateway with `PAYMENT_SERVICE_URL=http://localhost:3004`.
Start the payment service and API gateway, then run the frontend. The support
page lets users choose a voluntary contribution of at least INR 1.00. It creates
an order at `POST /api/payments/create-order`, opens Razorpay Checkout, and
verifies its signature at `POST /api/payments/verify-payment`.

The unauthenticated webhook is available at both
`POST /api/payment/razorpay/webhook` and
`POST /api/payments/razorpay/webhook`. Its route receives the raw request body
for HMAC verification before JSON parsing. Enable `payment.captured`,
`payment.failed`, and `order.paid` in Razorpay's webhook settings. Processed
Razorpay event IDs are persisted with a unique index, and payment status is
stored by Razorpay order ID. Failed database processing returns an error so
Razorpay can retry delivery.

For local testing, start the API gateway and payment service, then expose the
gateway port with ngrok, for example `ngrok http 8080`. Configure Razorpay with
the public tunnel URL followed by `/api/payment/razorpay/webhook`. Use Razorpay
test mode to send a test webhook and confirm the payment service returns 200.

Use Razorpay test credentials and test payment methods for local testing. Never
expose `RAZORPAY_KEY_SECRET` to the frontend or commit `.env`.
For deployment, configure the Razorpay credentials, webhook secret, MongoDB
URI, and matching JWT secret as payment-service environment secrets, and point
the gateway's `PAYMENT_SERVICE_URL` at the deployed payment service.

Run unit tests with `npm test`.
