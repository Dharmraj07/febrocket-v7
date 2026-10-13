import test from "node:test";
import assert from "node:assert/strict";

import {
  DOCUMENT_PROCESSING_CHECK_DELAY_MS,
  documentProcessingCheckDelay,
  documentProcessingCheckKey,
  libraryDocumentId,
} from "./documentPresentation.js";

test("processing checks wait two minutes from the persisted queue timestamp", () => {
  const document = {
    _id: "document-1",
    createdAt: "2026-09-30T10:00:00.000Z",
    processingRequestedAt: "2026-09-30T10:01:00.000Z",
  };
  const now = new Date("2026-09-30T10:02:00.000Z").getTime();

  assert.equal(documentProcessingCheckDelay(document, now), 60_000);
  assert.equal(
    documentProcessingCheckDelay(document, now + 120_000),
    0
  );
  assert.equal(
    documentProcessingCheckKey(document),
    "document-1:2026-09-30T10:01:00.000Z"
  );
});

test("legacy documents fall back to their upload time and missing times to a full delay", () => {
  const now = new Date("2026-09-30T10:02:00.000Z").getTime();

  assert.equal(
    documentProcessingCheckDelay(
      { _id: "legacy", createdAt: "2026-09-30T10:01:30.000Z" },
      now
    ),
    90_000
  );
  assert.equal(
    documentProcessingCheckDelay({ _id: "missing-time" }, now),
    DOCUMENT_PROCESSING_CHECK_DELAY_MS
  );
});

test("library document IDs resolve document references instead of subdocument IDs", () => {
  assert.equal(
    libraryDocumentId({
      _id: "library-entry-1",
      documentId: "document-1",
    }),
    "document-1"
  );
  assert.equal(
    libraryDocumentId({
      _id: "library-entry-2",
      documentId: { _id: "document-2" },
    }),
    "document-2"
  );
  assert.equal(libraryDocumentId("legacy-document-id"), "legacy-document-id");
});
