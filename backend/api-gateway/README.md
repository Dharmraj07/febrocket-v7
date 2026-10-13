# API Gateway

The gateway routes requests to the auth, document, message, and payment
services without parsing or changing request bodies:

- `/api/auth/*` → `AUTH_SERVICE_URL`
- `/api/documents/*` → `DOCUMENT_SERVICE_URL`
- `/api/document-data/*` → `DOCUMENT_SERVICE_URL`
- `/api/messages/*` → `MESSAGE_SERVICE_URL`
- `/api/payments/*` → `PAYMENT_SERVICE_URL`
- `/api/payment/*` → `PAYMENT_SERVICE_URL` (singular alias for webhook URLs)

It also handles browser CORS. Authentication, authorization, and document
business logic remain in their respective services.

## Run locally

Start the auth service on port `3001`, the document service on port `3002`, and
the payment service on port `3004`. Then, from this directory, create a local
environment file if one does not already exist and start the gateway:

```bash
cp -n .env.example .env
npm install
npm start
```

The defaults listen on `0.0.0.0:8080`, forward to the local auth, document,
message, and payment services, and allow browser requests from
`http://localhost:3000`. Set `AUTH_SERVICE_URL`, `DOCUMENT_SERVICE_URL`,
`MESSAGE_SERVICE_URL`, `PAYMENT_SERVICE_URL`, and `CORS_ORIGIN`, and optionally
`PROXY_TIMEOUT_MS` in `.env` to change those defaults. `CORS_ORIGIN` accepts
comma-separated origins. No payment API keys are required by the gateway.

Run the gateway tests with:

```bash
npm test
```

## Deploy to Cloud Run

From this directory, deploy the source with the Cloud Run service URLs and
frontend origin supplied as environment variables:

```bash
gcloud run deploy api-gateway \
  --source . \
  --region REGION \
  --allow-unauthenticated \
  --set-env-vars "AUTH_SERVICE_URL=https://AUTH_SERVICE_URL,DOCUMENT_SERVICE_URL=https://DOCUMENT_SERVICE_URL,MESSAGE_SERVICE_URL=https://MESSAGE_SERVICE_URL,PAYMENT_SERVICE_URL=https://PAYMENT_SERVICE_URL,CORS_ORIGIN=https://FRONTEND_ORIGIN"
```

Cloud Run supplies `PORT`; the gateway binds to `0.0.0.0` and uses that port.
Replace the example values with the deployed service URLs and browser origin.
