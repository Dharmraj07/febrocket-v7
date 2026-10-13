# Transformation Service

Transformation-Service is a private document-transformation microservice for the FebRocket backend. It validates document requirements, plans minimal deterministic transformations, and prepares derivative output while preserving the original document in Document-Service.

## What it does

- Inspects source files and extracts metadata such as MIME type, size, dimensions, and page count.
- Validates a document against structured requirements.
- Plans a minimal set of deterministic operations such as resize, crop, convert, or compression.
- Supports internal service-to-service requests using a private API key.
- Provides a predictable API for future Document-Service integration.

## What it does not do

- It does not own documents, MongoDB collections, R2 buckets, users, or auth sessions.
- It does not modify the original source file.
- It does not expose private routes through the public API Gateway.
- It does not use AI for core conversion logic.

## Internals and routes

Base path:

- `/api/transformation`

Routes:

- `GET /health`
- `POST /analyze`
- `POST /validate`
- `POST /plan`
- `POST /transform`
- `GET /transform/:jobId`
- `DELETE /temporary/:jobId`
- private internal callbacks under `/api/transformation/internal/...`

## Internal authentication

All private service-to-service requests use the header:

```
x-transformation-service-key: <shared secret>
```

The secret is configured using:

```
TRANSFORMATION_SERVICE_API_KEY
```

The service rejects missing or incorrect keys with a consistent unauthorized response and never logs the key value.

## Requirements schema

Example:

```json
{
  "format": "pdf",
  "maxSize": 2097152,
  "width": 200,
  "height": 230,
  "minWidth": 180,
  "maxWidth": 300,
  "minHeight": 180,
  "maxHeight": 300,
  "pageCount": 1
}
```

## Supported behavior

- Image format detection and basic metadata extraction using Sharp.
- PDF detection and basic metadata reading via pdf-lib.
- Requirement validation and planning.
- Deterministic response format suitable for Document-Service orchestration.

## Queue behavior

This service includes configuration hooks for Redis/BullMQ-style integration, but does not force a queue implementation unless the backend project adopts it. The configuration keys are kept in `.env.example` for future production integration.

## Temporary files

Temporary files are created under the system temp directory and cleaned up using best-effort deletion. The service intentionally avoids permanent storage of transformed output.

## Local development

```bash
npm install
cp .env.example .env
npm test
npm start
```

## Docker

```bash
docker build -t transformation-service .
```

## Cloud Run

The service listens on `PORT` and is safe for Cloud Run deployment. The Docker image includes Node.js, Ghostscript, Poppler, and the transformation libraries required for image and PDF work.

## Integration with Document-Service

Document-Service remains the owner of document metadata, signed URLs, temporary storage lifecycle, and the authoritative document library. Transformation-Service is only responsible for analysis, validation, planning, and deterministic transformation work.

## Example response

```json
{
  "success": true,
  "jobId": "tr_9f4f1a6b7d0c9e4d",
  "status": "completed",
  "output": {
    "format": "pdf",
    "mimeType": "application/pdf",
    "size": 1847291
  },
  "operations": ["convert_to_pdf", "compress_pdf"],
  "validation": {
    "valid": true,
    "issues": []
  }
}
```
