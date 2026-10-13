# FebRocket

FebRocket is a document-assistant platform made up of a web application, an
API gateway and backend services, and a WXT browser extension. The frontend and
extension are clients of the existing backend; they do not implement separate
authentication providers.

This file is the workspace-level guide. Each application also has a
service-specific README with implementation and endpoint details:

- [Frontend guide](./frontend/README.md)
- [API Gateway guide](./backend/api-gateway/README.md)
- [Authentication Service guide](./backend/auth-service/README.md)
- [Document Service guide](./backend/document-service/README.md)
- [Browser Extension guide](./febrocket-extension/README.md)

## Contents

- [Workspace layout](#workspace-layout)
- [Architecture](#architecture)
- [Local service URLs](#local-service-urls)
- [Requirements](#requirements)
- [Local setup](#local-setup)
- [Environment configuration](#environment-configuration)
- [Authentication](#authentication)
- [Document lifecycle](#document-lifecycle)
- [API overview](#api-overview)
- [Frontend overview](#frontend-overview)
- [Browser extension overview](#browser-extension-overview)
- [Tests and checks](#tests-and-checks)
- [Troubleshooting and known integration notes](#troubleshooting-and-known-integration-notes)
- [Security and operations](#security-and-operations)

## Workspace layout

```text
sep/
├── README.md
├── frontend/                       Next.js web application
│   ├── public/                     Static images and site assets
│   └── src/
│       ├── app/                    App Router pages
│       ├── features/               Auth, dashboards, documents, messages
│       ├── lib/                    Shared Axios client
│       └── store/                  Redux Toolkit store and provider
├── backend/
│   ├── api-gateway/                Browser-facing API and service proxy
│   ├── auth-service/               Accounts, OAuth, JWT sessions and auth APIs
│   ├── document-service/           Uploads, storage, extraction and workers
│   └── processing-service/         Asynchronous document worker
└── febrocket-extension/            WXT + React browser extension
    ├── components/                 Shared popup/side-panel UI
    ├── entrypoints/
    │   ├── background.ts           Central extension auth coordinator
    │   ├── popup/                  Toolbar popup page
    │   └── sidepanel/              Browser side-panel page
    ├── public/                     Extension icons/assets
    ├── utils/                      Shared extension message and auth types
    └── wxt.config.ts               Manifest and host permissions
```

There is no root-level package manifest or monorepo command runner. Install,
run, and test each project from its own directory. The three backend projects
also have independent package manifests and lockfiles.

## Architecture

```text
                         FebRocket
                             |
             +---------------+----------------+
             |                                |
       Next.js frontend                WXT extension
             |                          popup/side panel
             |                                |
             +---------- HTTP/API ------------+
                             |
                      API Gateway :8080
                       /      |      \
                      /       |       \
              Auth :3001  Docs :3002  Messages :3003*
                 |            |
             MongoDB       MongoDB
                 |            |
               Redis        Redis/BullMQ worker
                 |            |             \
        Cloudflare R2  Gemini API    Gemini API
                           (form mapping) (document extraction)
```

`*` The gateway is configured to proxy `/api/messages` to a message service at
port `3003`, but a message-service project is not present in this workspace
layout. Configure that service separately if the message routes are needed.

The frontend owns web navigation, page rendering, and Redux UI state. The
backend owns user identity, access control, session validity, document
ownership, persistence, and processing. The browser extension background owns
the extension's in-memory auth view; popup and side panel consume that same
state over extension runtime ports.

`POST /api/forms/map` is exposed through API Gateway and authenticated by
Document-Service. It verifies ownership of the selected person library and sends
the detected website field descriptors together with bounded extracted profile
data directly to Gemini in Document-Service. The extension fills validated
matches and presents lower-confidence suggestions for confirmation. Form mapping
uses a separate Document-Service module and does not modify the existing
Processing-Service document worker or queue.

## Local service URLs

The current local configuration uses these URLs:

| Component | Local URL | Notes |
| --- | --- | --- |
| Frontend | `http://localhost:3000` | Next.js dev server default |
| API Gateway | `http://localhost:8080` | Browser-facing API base |
| Auth Service | `http://localhost:3001` | Normally accessed through the gateway |
| Document Service | `http://localhost:3002` | Normally accessed through the gateway |
| Message Service | `http://localhost:3003` | Gateway target; service is not in this workspace |
| MongoDB | Configured by `MONGO_URI` | Auth and documents can use different databases |
| Redis | `redis://localhost:6379` | Auth state/rate limits and document job queue |

The frontend's API client defaults to `http://localhost:8080`. The gateway
defaults to auth `:3001`, documents `:3002`, and messages `:3003`. The checked-in
document-service example environment currently says `PORT=8080`; when running
the gateway and document service together locally, set the document service
`PORT=3002` to match the gateway's `DOCUMENT_SERVICE_URL`.

## Requirements

- Node.js 18 or newer (use a current supported Node.js release where possible).
- npm.
- MongoDB reachable by the auth and document services.
- Redis reachable by the auth and document services.
- Chromium for loading and testing the side-panel extension.
- Google OAuth client credentials and a registered callback URL to use Google
  sign-in.
- Email-provider configuration for account verification and password reset.
- Cloudflare R2 credentials and Gemini API keys in Document-Service (form
  mapping) and Processing-Service (document extraction).
- The configured message service on port `3003` if message APIs are required.

Redis can be unavailable for some auth-service operation: it has fallbacks for
some session state, OAuth state, and rate limiting. The document service
disables its asynchronous worker when Redis is unavailable, so document
processing will not run normally without Redis.

## Local setup

### 1. Configure environment files

Copy the examples when a local `.env` does not already exist. Do not overwrite
existing local environment files:

```bash
cp -n frontend/.env.example frontend/.env
cp -n backend/api-gateway/.env.example backend/api-gateway/.env
cp -n backend/auth-service/.env.example backend/auth-service/.env
cp -n backend/document-service/.env.example backend/document-service/.env
cp -n febrocket-extension/.env.example febrocket-extension/.env
```

Fill in local database, Redis, OAuth, email, object-storage, and AI-provider
values as needed. Keep secrets in ignored local environment files or a secrets
manager; never commit them.

For local frontend sign-in, configure:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
NEXT_PUBLIC_GOOGLE_AUTH_URL=http://localhost:8080/api/auth/google
```

The frontend example file currently contains a production Google-auth URL;
override it as above for local development. When signing in through the API
gateway, set `GOOGLE_CALLBACK_URL` and register this exact URI with Google:
`http://localhost:8080/api/auth/google/callback`. The gateway forwards the
callback request to the auth service.

### 2. Install dependencies

```bash
cd backend/auth-service && npm install
cd ../document-service && npm install
cd ../api-gateway && npm install
cd ../../frontend && npm install
cd ../febrocket-extension && npm install
```

Each `cd` above is relative to the previous working directory. Alternatively,
run each `npm install` in a separate terminal with that project directory as
the working directory.

### 3. Start backend services

Start MongoDB and Redis first. Then start each service in a separate terminal:

```bash
cd backend/auth-service
npm run dev
```

```bash
cd backend/document-service
npm run dev
```

```bash
cd backend/api-gateway
npm start
```

Expected local ports: auth `3001`, document `3002`, gateway `8080`. Verify:

```bash
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:8080/health
```

The gateway `/health` checks only the gateway process. Auth and message health
proxies are available at `/api/auth/health` and `/api/messages/health`;
document-service health is directly at `:3002/health`.

### 4. Start the frontend

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`.

### 5. Build and load the browser extension

For a Chromium development build:

```bash
cd febrocket-extension
npm run dev
```

Alternatively, create a production build:

```bash
npm run build
```

In Chromium, open `chrome://extensions`, enable Developer mode, choose **Load
unpacked**, and select `febrocket-extension/.output/chrome-mv3-dev` for the dev
build or `.output/chrome-mv3` for the production build. Open the toolbar popup
from the FebRocket extension icon. Open the side panel from the browser's
side-panel UI/menu.

The extension's defaults are `WXT_API_BASE_URL=http://localhost:8080` and
`WXT_FRONTEND_URL=http://localhost:3000`. The WXT manifest grants the configured
API origin only and requests the `sidePanel` permission.

## Environment configuration

Use the project `.env.example` files as the full lists of supported settings.
The values below are the main integration settings; real secrets are
intentionally not listed.

### Frontend

| Variable | Purpose | Local value |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Axios API gateway URL | `http://localhost:8080` |
| `NEXT_PUBLIC_GOOGLE_AUTH_URL` | Existing backend Google OAuth start route | `http://localhost:8080/api/auth/google` |

Axios uses `withCredentials: true`, so browser requests include the
backend-managed cookies.

### API Gateway

| Variable | Purpose | Default/local value |
| --- | --- | --- |
| `PORT` | Gateway listen port | `8080` |
| `AUTH_SERVICE_URL` | Auth-service upstream | `http://localhost:3001` |
| `AUTH_SERVICE_HEALTH` | Auth health-check URL | `http://localhost:3001/health` |
| `DOCUMENT_SERVICE_URL` | Document-service upstream | `http://localhost:3002` |
| `DOCUMENT_SERVICE_HEALTH` | Document health-check URL | `http://localhost:3002/health` |
| `MESSAGE_SERVICE_URL` | Message-service upstream | `http://localhost:3003` |
| `MESSAGE_SERVICE_HEALTH` | Message health-check URL | `http://localhost:3003/health` |
| `CORS_ORIGIN` | Comma-separated allowed browser origins | `http://localhost:3000` |
| `PROXY_TIMEOUT_MS` | Upstream request timeout | `30000` |

The gateway forwards auth, document, document-data, and message API requests.
It preserves cookies, request bodies, status codes, and upstream response
headers while applying its own browser CORS policy.

### Authentication Service

Important variables include:

- `PORT` (local `3001`) and `NODE_ENV`.
- `MONGO_URI` for user accounts and refresh-session records.
- `REDIS_URL` for short-lived session state, identity caching, rate limits,
  OAuth state, and OTP storage.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
  `JWT_ACCESS_EXPIRY` (default `15m`), and `JWT_REFRESH_EXPIRY` (default `90d`).
- `COOKIE_SAMESITE` (default `lax`) and `COOKIE_SECURE`.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
  `GOOGLE_CALLBACK_URL` (default local callback on port `3001`).
- Optional Facebook OAuth variables: `FACEBOOK_APP_ID`,
  `FACEBOOK_APP_SECRET`, `FACEBOOK_CALLBACK_URL`.
- `FRONTEND_URL`, `CORS_ORIGIN`, `OAUTH_SUCCESS_REDIRECT`, and
  `OAUTH_FAILURE_REDIRECT` (usually `http://localhost:3000` locally).
- Email configuration such as `RESEND_API_KEY` and `MAIL_FROM`.
- OTP, cache, rate-limit, and OAuth-state TTL/limit settings.

Use distinct strong JWT secrets in production. Never put OAuth client secrets,
JWT secrets, email API keys, or database credentials in frontend or extension
configuration.

### Document Service

Important variables include:

- `PORT` (use `3002` with the local gateway), `NODE_ENV`,
  `MONGO_URI`, and `REDIS_URL`.
- `AUTH_SERVICE_URL` (normally `http://localhost:3001`) and
  `AUTH_SERVICE_TIMEOUT_MS`.
- `JWT_ACCESS_SECRET` and related token settings used by the document service
  for request authentication.
- `CLIENT_URL`, `COOKIE_SAMESITE`, and `COOKIE_SECURE`.
- `OCR_WORKER_CONCURRENCY`.
- `GEMINI_API_KEY_1` and optional additional Gemini keys,
  `GEMINI_MODEL_1`, `GEMINI_MODEL_2`, `GEMINI_FILE_PROCESSING_TIMEOUT_MS`,
  and `FORM_MAPPING_GEMINI_TIMEOUT_MS`. Configure mapping Gemini credentials in
  Document-Service and document-extraction credentials in Processing-Service.
- Cloudflare R2 settings: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`, and
  `R2_PUBLIC_URL`.

The environment example also contains optional OCR provider settings. Configure
the provider(s) actually used in the document pipeline.

### Browser Extension

| Variable | Purpose | Default |
| --- | --- | --- |
| `WXT_API_BASE_URL` | API gateway URL used by the background worker | `http://localhost:8080` |
| `WXT_FRONTEND_URL` | Existing frontend URL for login and opening the app | `http://localhost:3000` |

These values are compiled into the extension build. The extension does not
contain OAuth credentials or store access/refresh token values.

## Authentication

FebRocket's backend remains the source of truth for authentication:

1. The frontend starts Google OAuth by navigating to
   `/api/auth/google` on the gateway.
2. The gateway proxies the OAuth routes to the auth service. Passport completes
   Google OAuth at the configured callback; the backend creates its existing
   access/refresh session and redirects to the frontend.
3. The auth service sets the existing website cookies (`access_token` and
   `refresh_token`) as HTTP-only cookies using the configured cookie policy.
4. The frontend checks `/api/auth/session` and `/api/auth/me` using Axios with
   credentials and stores the returned public user in Redux.
5. The extension background calls the existing `GET /api/auth/me` endpoint.
   It does not read page storage, inspect website cookies, or copy tokens into
   extension storage.
6. To make an already-authenticated website session detectable by the
   extension, the auth service also issues HTTP-only, `Secure`,
   `SameSite=None` companion cookies. They use separate names and narrow paths:
   `/api/auth/me` for the access cookie and `/api/auth/refresh` for the refresh
   cookie. Existing `/session` and `/me` responses can provision these
   companion cookies for a pre-existing website session.
7. If `/me` returns `401`, the background tries the existing `/refresh` route.
   A successful refresh rotates the backend session; the worker checks `/me`
   again. A final `401` becomes logged-out state.
8. Backend logout revokes the refresh session and clears both website and
   extension cookie sets. Popup and side panel share the background's state,
   which they refresh when opened and periodically while open.

The actual `/me` user fields are `id`, `email`, `role`, and `userName`. The
extension displays the username and email; it does not make authorization
decisions based on UI state.

### Browser CORS note for extension development

The gateway's default `CORS_ORIGIN` allows `http://localhost:3000`. Chromium
extension requests come from the installed extension's own origin
(`chrome-extension://<extension-id>`), so the gateway must also allow that exact
origin for credentialed extension requests. After loading the extension,
copy its ID from `chrome://extensions` and append its origin to the gateway
allowlist, for example:

```env
CORS_ORIGIN=http://localhost:3000,chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef
```

Restart the gateway after changing its `.env`. Do not use `*` with credentialed
auth requests. Firefox uses a `moz-extension://...` origin; configure the
specific origin if developing for Firefox. The current local WXT config targets
Chromium and the `sidePanel` API.

## Document lifecycle

The current document workflow is:

1. The signed-in frontend uploads one file to `POST /api/documents/upload` as
   multipart field `document`.
2. The document service authenticates the request, uploads the file to
   Cloudflare R2, and saves document metadata in MongoDB.
3. A processing job is queued through BullMQ/Redis.
4. A worker fetches the file, runs the configured document/OCR/AI pipeline,
   then persists extracted data and the terminal processing status.
5. The frontend displays document metadata and uses a detail request when full
   extracted data or raw text is needed.

Document statuses include `uploaded`, `queued`, `processing`, `processed`, and
`failed`. The backend stores `processingRequestedAt` for initial attempts and
retries. The frontend uses it to defer its first data/status refresh for two
minutes, including after a page reload. User and admin document lists omit
large extracted `data` and `rawText` payloads; detail endpoints return full
document content. The service also has a local-disk upload route for
development/testing.

Document ownership is enforced by the backend. Admin document operations
require an authenticated admin role.

## API overview

Browser-facing API base:

```text
http://localhost:8080
```

### Health checks

| Method | Path | Service |
| --- | --- | --- |
| `GET` | `/health` | API Gateway |
| `GET` | `/api/auth/health` | Auth-service proxy health |
| `GET` | `http://localhost:3001/health` | Auth Service direct |
| `GET` | `http://localhost:3002/health` | Document Service direct |
| `GET` | `/api/messages/health` | Message-service proxy health |

### Authentication routes

| Method | Gateway path | Purpose |
| --- | --- | --- |
| `GET` | `/api/auth/google` | Start Google OAuth |
| `GET` | `/api/auth/google/callback` | Existing OAuth callback |
| `GET` | `/api/auth/facebook` | Start optional Facebook OAuth |
| `GET` | `/api/auth/facebook/callback` | Optional Facebook callback |
| `POST` | `/api/auth/register` | Register local account |
| `POST` | `/api/auth/login` | Local login |
| `POST` | `/api/auth/refresh` | Rotate refresh session |
| `POST` | `/api/auth/logout` | Revoke session and clear cookies |
| `GET`, `POST` | `/api/auth/verify-email` | Email OTP verification |
| `POST` | `/api/auth/forgot-password` | Start password reset |
| `POST` | `/api/auth/resend-otp` | Resend verification/reset OTP |
| `POST` | `/api/auth/reset-password` | Reset password with OTP |
| `GET` | `/api/auth/session` | Return current authenticated user |
| `GET` | `/api/auth/me` | Return current authenticated user |
| `PUT` | `/api/auth/profile` | Update current profile |
| `PUT` | `/api/auth/change-password` | Change current password |
| `DELETE` | `/api/auth/account` | Delete current account |
| `GET`, `PUT`, `DELETE` | `/api/auth/admin/users...` | Admin user management |

The authenticated identity response is `{ success: true, user }`. Protected
routes require valid backend authentication; admin routes additionally require
the `admin` role.

### Document routes

| Method | Gateway path | Purpose |
| --- | --- | --- |
| `POST` | `/api/documents/upload` | Upload one file to configured object storage |
| `POST` | `/api/documents/upload/local` | Upload to local disk for development |
| `GET` | `/api/documents` | List current user's documents |
| `GET` | `/api/documents/:id` | Read a user's document |
| `GET` | `/api/documents/:id/preview` | Preview owned document |
| `GET` | `/api/documents/:id/download` | Download owned document |
| `POST` | `/api/documents/:id/retry` | Retry document processing |
| `PUT` | `/api/documents/:id/data` | Update extracted data |
| `DELETE` | `/api/documents/:id` | Delete owned document |
| `GET` | `/api/documents/admin/stats` | Admin document statistics |
| `GET` | `/api/documents/admin/all` | Search/list all documents |
| `GET`, `POST`, `PUT`, `DELETE` | `/api/documents/admin/:id...` | Admin document operations |

Uploads use multipart form-data field `document`. Upload size and file validation
are enforced by document-service middleware.

### Document-data compatibility routes

`/api/document-data` provides user and admin list/detail/update/delete
operations. These are compatibility aliases over the unified `Document` model;
there is no separate document-data collection.

### Message routes

`/api/messages/*` is forwarded to the configured message service. Its
implementation is not present in this workspace.

## Frontend overview

The frontend is a Next.js App Router app using React, Redux Toolkit, and
Axios. Feature logic is organized in `src/features`; store setup is in
`src/store`; the shared credentialed API client is in `src/lib/api.js`.

The homepage (`/`) starts the existing Google login flow and checks the current
session. Dashboard access is role guarded:

- `/dashboard` and `/dashboard/user` for user dashboards.
- `/dashboard/business` for business dashboards.
- `/dashboard/admin` for admin dashboards.

The app also includes contact, privacy, terms, and data-deletion pages. User
and admin dashboards use document feature actions for upload, listing, detail,
preview, download, delete, retry, and extracted-data updates. The app has
authentication, document, dashboard, and admin-related test files; message
features may require the separate message API service.

Useful frontend scripts (`cd frontend` first):

```bash
npm run dev
npm run build
npm start
npm run lint
npm test
```

## Browser extension overview

The extension uses WXT 0.21 with React. WXT discovers files under `entrypoints`
and generates the Manifest V3 background worker, popup, and Chromium side panel.
The popup and side panel render the shared `components/AuthApp.tsx` UI and
connect to the background using the `febrocket-auth` runtime port.

The background:

- owns the current extension auth state in memory;
- sends credentialed requests only to the configured API base;
- calls the backend's existing `/api/auth/me` and `/api/auth/refresh` routes;
- shares auth-state updates with popup and side panel;
- opens the existing frontend homepage for login and `/dashboard` for the app.

The extension does not implement Google OAuth, read website localStorage, copy
tokens, or store refresh credentials. The side panel currently contains
placeholder “Coming soon” entries for Form Assistant, Document Assistant, and
AI Browser Agent; form analysis/filling and browser automation are not
implemented.

Useful extension scripts (`cd febrocket-extension` first):

```bash
npm run dev
npm run build
npm run compile
npm run zip
npm run dev:firefox
npm run build:firefox
npm run zip:firefox
```

The extension currently requests `sidePanel` and host access to only the
configured API origin. Popup and side panel are Chromium features in this
configuration; a Firefox build does not imply that Firefox implements the
Chromium side-panel API.

## Tests and checks

Run tests/checks for each project:

```bash
npm --prefix backend/api-gateway test
npm --prefix backend/auth-service test
npm --prefix backend/document-service test
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix febrocket-extension run compile
npm --prefix febrocket-extension run build
```

These commands can be run from the workspace root. The auth-service tests
include session/token behavior, config checks, and extension companion cookie
properties and logout clearing.

## Troubleshooting and known integration notes

- **Extension displays an auth/network error:** confirm API Gateway and Auth
  Service are running, `WXT_API_BASE_URL` points to the gateway, and gateway
  `CORS_ORIGIN` includes the exact installed extension origin.
- **Frontend sign-in uses the wrong backend:** set
  `NEXT_PUBLIC_GOOGLE_AUTH_URL` to `http://localhost:8080/api/auth/google` and
  restart Next.js after changing environment variables.
- **Google callback fails:** verify Google Console's authorized redirect URI
  exactly matches `GOOGLE_CALLBACK_URL`; verify OAuth success/failure redirects
  target the local frontend.
- **Document service fails to start:** check MongoDB connectivity and use port
  `3002` locally so it does not conflict with the API gateway on `8080`.
- **Document uploads fail:** check R2 credentials, bucket endpoint/public URL,
  upload size/type restrictions, and whether the request is authenticated.
- **Documents remain queued:** check Redis and worker startup logs; processing
  requires the BullMQ worker and configured document-extraction provider keys.
- **Gateway message routes fail:** the message-service target defaults to
  `localhost:3003`, but its service is not part of this workspace.
- **Extension side panel is unavailable:** use a Chromium browser version
  supporting the `sidePanel` extension API and load the Chromium WXT output.

The extension auth flow and service checks have been built/tested at code level,
but the complete browser OAuth flow requires valid local OAuth credentials,
running backend dependencies, an allowed extension origin, and a browser
installation of the built extension.

## Security and operations

- Keep `.env` files out of version control. Commit only examples containing
  placeholders.
- Use HTTPS, secure cookies, strong distinct JWT secrets, private Redis, and
  restricted CORS origins in production.
- Do not expose OAuth client secrets, database credentials, JWT secrets,
  provider API keys, or refresh tokens to browser UI or extension content.
- The auth service stores password hashes, not plaintext passwords, and returns
  public identity fields from protected identity routes.
- Access and refresh sessions are managed and rotated by the backend. Logout
  revokes the server-side refresh session.
- Document endpoints check authentication and document ownership; admin routes
  check the admin role.
- The extension host permission is intentionally limited to the configured API
  origin; it does not need broad `<all_urls>` access for its current auth-only
  functionality.
- Configure service health checks and graceful shutdown for deployments. The
  gateway accepts Cloud Run's `PORT`; see the API Gateway README for deployment
  notes.
