# Processing Service

Processing-Service consumes the `document-processing` BullMQ queue and runs
document OCR/AI extraction independently from Document-Service. It does not
connect to MongoDB or R2 and does not own document, user, or access records.

## Responsibilities

- Retrieve the source file through Document-Service using an expiring signed URL.
- Run the existing Gemini extraction and display-name generation logic.
- Report processing results and terminal failures to Document-Service.

Document-Service owns queue creation, document metadata/status/results, R2
storage, and document-library synchronization. Both services must use the same
Redis instance and queue name.

## Run

```bash
npm install
cp .env.example .env
npm start
```

Configure `REDIS_URL`, `DOCUMENT_SERVICE_URL`, and a private
`PROCESSING_SERVICE_API_KEY` matching the value in Document-Service. Configure
Gemini credentials here for document extraction; configure form-mapping Gemini
credentials in Document-Service. Never put provider credentials in the frontend.
Scale Processing-Service instances independently; `OCR_WORKER_CONCURRENCY`
controls each instance's worker concurrency.

The service uses Document-Service's internal endpoints:

- `GET /internal/processing/documents/:id/source?requestId=...`
- `POST /internal/processing/results`

Both require the `x-processing-service-key` header and are not routed through
the public API Gateway. Form mapping runs directly in Document-Service and is
independent from this document-processing worker.
