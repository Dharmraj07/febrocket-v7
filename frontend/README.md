# FebRocket Frontend

The frontend is a Next.js App Router application. Feature code is grouped under
`src/features`; shared Axios configuration lives in `src/lib/api.js`, and Redux
state is registered in `src/store`.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_API_BASE_URL` to the API gateway URL.
3. Install dependencies and start the app:

```bash
npm install
npm run dev
```

Run the frontend checks with:

```bash
npm test
npm run lint
npm run build
```

## Document flow

The user and admin dashboards dispatch document operations from
`features/document/documentSlice.js`. The backend upload response is inserted
into Redux directly; it is not immediately refetched. Lists contain metadata,
while document details are fetched on demand so extracted JSON and raw text do
not inflate every list response.

The document service stores `processingRequestedAt` when it queues a new
processing attempt. Dashboards use that server timestamp to schedule the first
status/data refresh for two minutes later, including after a page refresh.
Retries start a new processing window. After a successful processing status
refresh, the dashboard also reloads document libraries so newly synchronized
person assignments appear without navigating away and back. The worker itself
starts as soon as the queue makes the job available.

Signed-in dashboards subscribe to the authenticated
`GET /api/documents/events` Server-Sent Events stream. Terminal processing
events refresh existing document, library, and admin Redux data through the
current API thunks. The existing server-timestamp-based status refresh remains
as a fallback if the event stream is unavailable.

Document states come from the backend (`uploaded`, `queued`, `processing`,
`processed`, or `failed`). Extracted information is read from
`document.data`; status refreshes do not infer success from local UI state.

## Support contributions

Signed-in personal users can open `/support` from the dashboard navigation.
Contributions are optional: the page links to Buy Me a Coffee and supports
voluntary INR payments through Razorpay Checkout, with payment signatures
verified by the payment service.

## Account navigation

The shared workspace navigation separates document actions from account
management. Signed-in personal users can manage profile details, password
security, preferences, and account deletion from `/settings`; the same
responsive navigation is used on the dashboard and support page. The dashboard's
Share section uses the existing authenticated `/api/auth/share/*` endpoints to
generate one-time connection codes, connect accounts, and disconnect accounts.
Redeeming a code grants one-way access to the code owner's documents only;
connected viewers cannot upload or delete. Authentication is cookie-based
through the shared Axios client, and access is verified by the document service.
