# Document Service

A Node.js/Express service for uploading, storing, previewing, and managing user documents. It stores files in Cloudflare R2, keeps metadata and processing results in MongoDB, and queues asynchronous work for Processing-Service through Redis + BullMQ.

## Features

- Secure document upload with JWT authentication
- Cloudflare R2 file storage for uploaded documents
- Document metadata and file lifecycle management in MongoDB
- Preview and download routes for user-owned and admin-owned documents
- Async document processing job creation via Redis/BullMQ
- Authenticated, owner-scoped Gemini form mapping
- Authenticated internal result handling from Processing-Service
- Admin dashboard endpoints for stats and document management
- Health check endpoint for service monitoring

## Tech Stack

- Node.js
- Express.js
- MongoDB with Mongoose
- Redis + BullMQ
- Cloudflare R2 object storage
- JWT-based auth
- Multer for multipart uploads

## Project Structure

```text
.
├── app.js                  # Express application setup
├── server.js               # Starts the API and MongoDB connection
├── config/                 # Environment and service config
├── controllers/            # Public and internal HTTP controllers
├── middleware/             # Auth and upload middleware
├── models/                 # Mongoose models
├── routes/                 # API routes
├── services/               # Document, storage, and queue logic
├── tests/                  # Smoke tests
├── uploads/                # Local upload storage
├── .env.example            # Example environment configuration
├── package.json            # Scripts and dependencies
└── README.md               # Project documentation
```

## Document Library

Processing-Service makes one Gemini extraction call per processing attempt.
That extraction stores ownership information (`person.identificationStatus`
and `person.persons`), document classification, and the document's other
relevant extracted fields together in `Document.data`. If ownership is
unavailable, the processor marks `person.identificationStatus` accordingly and
sets `libraryCategory` to `"Uncategorized"`. After Processing-Service reports
completion and Document-Service saves the extraction and processed status,
Document-Service resolves each explicitly identified person against that user's
document libraries and stores a snapshot of the persisted
`Document.data` alongside the document reference and extracted document type.
Reprocessing replaces that document's existing library entry instead of adding
a duplicate. A document without reliably identified ownership is attached to
that user's `"Uncategorized"` library; no person identity is inferred or
invented. `Document.data` remains the authoritative extraction.
Document-Service performs the library synchronization because it owns document
and user relationships.

All library routes require the same JWT authentication as document routes:

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/document-library/resolve` | Find or create a library for the selected account |
| `POST` | `/api/document-library/:libraryId/documents` | Attach a document to a selected account's library |
| `GET` | `/api/document-library` | List libraries for the selected account |
| `GET` | `/api/document-library/:libraryId` | Get one library for the selected account |
| `GET` | `/api/document-library/:libraryId/documents` | List documents attached to a selected account's library |
| `PATCH` | `/api/document-library/:libraryId` | Rename a library for the selected account |
| `DELETE` | `/api/document-library/:libraryId` | Delete the caller's own library relationship only |

Deleting a library does not delete its `Document` records or R2 files.

### Connected account access

Existing document, document-library, document-data, and form-mapping endpoints
accept an optional `ownerId` query parameter. When it identifies the caller's
connected document owner, Document-Service verifies the relationship through
the existing authenticated `GET /api/auth/share/connection` endpoint before
serving or modifying that account's data. No new API routes are required.
Connection verification fails closed if Auth-Service cannot be reached.

Only the person who redeems the code can view, preview, download, retry
processing, edit extracted information, and organize the code owner's libraries.
These changes are saved to the owner's account. The owner cannot access the
viewer's documents unless they redeem a separate code from that viewer. Uploads
always belong to the signed-in account; document deletion, library deletion, and
document-data deletion remain restricted to the signed-in account. Either person
can disconnect, and switching to another account revokes the previous access.

## Form Mapping API

`POST /api/forms/map` requires the existing user JWT cookie or bearer token.
The request identifies one accessible `libraryId`, website metadata, and detected
website fields. For a connected account's library, include its `ownerId` as a
query parameter. Document-Service verifies access and projects bounded
extracted data into canonical person facts with document provenance and
field-specific source authority. The core vocabulary supports global English
terminology for names, phone numbers, postal codes, administrative regions,
address levels, employment, education, and distinct national identity
documents. Country-specific identifiers are never treated as interchangeable.
An explicitly selected country and the page language are passed as context;
neither is used to infer personal or legal facts. Only facts relevant to each
field are sent to the form-mapping-specific Gemini prompt; raw OCR and unrelated
document data are not included. Document-Service validates each proposed value
against its fact source, resolves conflicts when one source is more
authoritative, and returns possible choices for unresolved conflicts. Each
result includes an action (`fill`, `ask_user`, `skip`, or `review`) alongside
the existing mapping status. Derived values still require reliable source
evidence and confidence; legal, eligibility, demographic, consent, and other
high-risk fields require review. This route does not enqueue or update
document-processing jobs.

The same authenticated API also exposes `POST /api/forms/session`,
`/analyze`, `/context`, `/resolve`, and `/feedback`. A session is bound to its
owner, selected library, and website origin and expires after 30 minutes of
inactivity. It stores only user-entered field answers and field-level status
feedback; feedback never includes field values. Session state is currently
in-memory and process-local, so it does not survive a Document-Service restart
and is not shared across multiple service instances.

The WXT extension starts/reuses the short-lived session for a form, sends
explicit user answers through `/resolve`, and reports only verified/failed
field statuses through `/feedback`. Saved answers are scoped to that session
and are not promoted to reusable person data. It sends bounded field context (accessible labels/help text,
control type/options, DOM grouping/order, validation state, and upload
constraints) and analyzes at most ten fields per Gemini call. It executes one
verified action at a time, rescans the page, and invalidates the remaining plan
when the visible form structure/options change. A session is bounded to 20
actions and 90 seconds per Fill operation; unresolved questions and review
items stop the loop. The extension does not automatically click navigation or
submission buttons; the user advances multi-step forms and starts another
analysis cycle.

Upload recommendations use the authenticated user's existing Document Library
metadata and document IDs, not a second document store. A unique matching
document is uploaded only when known MIME/size requirements are met; ambiguous
matches, type/size failures, or conversion requirements are left for the user.
The extension verifies that the targeted file input contains the selected
file. Conversion/compression and image-dimension editing are not implemented.

There is no separate structured `Person` model in this repository. The current
person selector is a `DocumentLibrary` record and its `documents[].data`
snapshots are the extracted facts. This implementation uses that existing
source rather than creating another profile source of truth. Explicitly
confirmed form answers remain session-scoped and are not persisted as reusable
person data.

The mapper does not split an unstructured full name into culturally assumed
given/family-name parts. Phone formatting is accepted only when every verified
digit is preserved, and ambiguous non-ISO dates are not autofilled. File inputs
are surfaced for user action through the existing manual attachment UI; the
current mapper does not yet infer file size/dimension requirements or convert
documents. Country/locale behavior has regression coverage, but live validation
against international websites is still required.

## Document display names

New uploads begin with `displayName` set to the original `fileName`. After
Gemini extraction succeeds, Processing-Service builds a readable display name from the
extracted document type and available issuer/board and year fields. When the
extraction does not contain a usable document type, the original filename is
kept. `fileName` remains unchanged for file operations and download names.

## Requirements

Before running the app, make sure you have:

- Node.js 18+
- MongoDB running locally or reachable via a remote URI
- Redis running locally or reachable via a remote URL
- Cloudflare R2 bucket configured (if using object storage)
- A Gemini API key configured in Document-Service for form mapping and in
  Processing-Service for document extraction

Add `GEMINI_API_KEY_1` and optionally `GEMINI_API_KEY_2` and
`GEMINI_API_KEY_3` to Document-Service's `.env` for form mapping. Use
`GEMINI_MODEL_1` and `GEMINI_MODEL_2` to select models and
`FORM_MAPPING_GEMINI_TIMEOUT_MS` to set the request timeout (default `120000`).

## Installation

1. Install dependencies:

```bash
npm install
```

2. Copy the example environment file:

```bash
cp .env.example .env
```

3. Update the environment variables in `.env`:

```env
NODE_ENV=production
PORT=8080
MONGO_URI=mongodb://localhost:27017/febrocket_documents
REDIS_URL=redis://localhost:6379
AUTH_SERVICE_URL=http://localhost:3001
AUTH_SERVICE_TIMEOUT_MS=5000
JWT_SECRET_KEY=replace-with-a-long-random-secret
JWT_ACCESS_SECRET=replace-with-a-long-random-access-secret
JWT_REFRESH_SECRET=replace-with-a-long-random-refresh-secret
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=90d
CLIENT_URL=http://localhost:3000
COOKIE_SAMESITE=lax
COOKIE_SECURE=true
PROCESSING_SERVICE_API_KEY=shared-long-random-internal-service-key
GEMINI_API_KEY_1=your_gemini_api_key
GEMINI_MODEL_1=gemini-2.0-flash
GEMINI_MODEL_2=gemini-1.5-flash
FORM_MAPPING_GEMINI_TIMEOUT_MS=120000

# Cloudflare R2
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your_bucket_name
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://your-public-url.example.com
```

For every environment, configure either a strong `JWT_SECRET_KEY` or both
`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. Each configured signing secret
must be at least 32 bytes and must not be a placeholder. Separate access and
refresh secrets must differ. The service fails closed when these requirements
are not met.

> Note: If you are not using Cloudflare R2, ensure the relevant values are valid or the storage flow may fail gracefully depending on your setup.

## Running the Service

Development mode:

```bash
npm run dev
```

Production mode:

```bash
npm start
```

## Health Check

```bash
curl http://localhost:8080/health
```

Example response:

```json
{
  "success": true,
  "service": "document-service",
  "status": "ok",
  "environment": "development",
  "timestamp": "2026-09-15T00:00:00.000Z"
}
```

## API Overview

All protected endpoints expect a JWT in the `Authorization` header or in a cookie named `access_token`.

`GET /api/documents/events` is an authenticated Server-Sent Events stream for
document processing status changes.

### Document Routes

#### Subscribe to processing status events

```http
GET /api/documents/events
Cookie: access_token=<JWT>
Accept: text/event-stream
```

The stream reports completed and failed processing events for the authenticated
user. Admin sessions receive events across users. Redis pub/sub distributes
events between Document-Service instances; event delivery supplements, rather
than replaces, the persisted document status and existing document-read APIs.
Clients reconnect automatically and should refresh current document state after
reconnecting.

#### Upload a document

```http
POST /api/documents/upload
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

Form field:

- `document`: uploaded file

#### List user documents

```http
GET /api/documents?page=1&limit=20
Authorization: Bearer <token>
```

Append `ownerId=<connected-account-id>` to view a connected account's documents.
Document-Service verifies the connection; clients cannot select arbitrary
accounts.

Paginated user document lists include metadata and `processingRequestedAt`, but
omit the potentially large `data` and `rawText` fields. Fetch the document
details endpoint when extracted information is needed.

#### Get one document metadata

```http
GET /api/documents/:id
Authorization: Bearer <token>
```

#### Preview a document

```http
GET /api/documents/:id/preview
Authorization: Bearer <token>
```

#### Download a document

```http
GET /api/documents/:id/download
Authorization: Bearer <token>
```

#### Delete a document

```http
DELETE /api/documents/:id
Authorization: Bearer <token>
```

#### Admin routes

```http
GET /api/documents/admin/stats
GET /api/documents/admin/all
GET /api/documents/admin/:id
GET /api/documents/admin/:id/preview
GET /api/documents/admin/:id/download
DELETE /api/documents/admin/:id
POST /api/documents/admin/:id/upload
```

These require an admin JWT (`req.user.role === "admin"`).
The admin upload route expects a multipart `document` field, verifies the target
user with the auth service, stores the file in R2, and queues document processing.
Admin document lists also omit `data` and `rawText`; the admin detail endpoint
returns the full document.

### Document Data Routes

```http
GET /api/document-data/
GET /api/document-data/:documentId
PUT /api/document-data/:documentId
DELETE /api/document-data/:documentId

GET /api/document-data/admin
GET /api/document-data/admin/user/:userId
GET /api/document-data/admin/:documentId
PUT /api/document-data/admin/:documentId
DELETE /api/document-data/admin/:documentId
```

These routes remain compatibility aliases over the unified `Document` model;
they do not use a separate document-data collection.

## Upload to Local Disk (Optional)

There is also a local upload route for testing without R2:

```http
POST /api/documents/upload/local
Authorization: Bearer <token>
```

This stores the file locally under the `uploads/` directory.

## Processing Flow

1. Client uploads a file through `/api/documents/upload`.
2. The request is authenticated and validated.
3. The file is uploaded to Cloudflare R2.
4. A document record is created in MongoDB.
5. A document-processing job is queued in Redis via BullMQ.
6. Processing-Service consumes the job, requests a short-lived signed R2 URL from Document-Service, and processes the file with Gemini.
7. Processing-Service posts the result or failure to an authenticated internal Document-Service endpoint.
8. Document-Service persists processing data/status and synchronizes the document with its libraries.

The internal source endpoint and result endpoint are available only to callers
with `PROCESSING_SERVICE_API_KEY`. The service key is never sent to the frontend.
Processing-Service must use the same Redis queue name (`document-processing`)
and the Document-Service internal URL.

`processingRequestedAt` is persisted whenever initial processing or a retry is
queued and is used as an idempotency token for callbacks. The independent
Processing-Service worker starts as soon as the job is available; clients use
this timestamp to defer their first status/data refresh by two minutes and
resume that delay correctly after a page refresh.

## Testing

Run the built-in smoke test:

```bash
npm test
```

## Notes

- The service is designed for authenticated app usage and relies on JWT tokens.
- If Redis or queueing is unavailable, a successfully stored document is kept
  with a failed processing status so the existing retry endpoint can requeue it.
- OCR/AI processing runs only in `backend/processing-service`; Document-Service
  remains the source of truth for document ownership, metadata, storage, and access.
- File previews support common browser-viewable formats including images and PDFs.
- The exact extraction method and worker behavior can vary based on the configured AI pipeline and environment variables.

## License

This project is licensed under the ISC license.
