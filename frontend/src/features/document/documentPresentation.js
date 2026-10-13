export const DOCUMENT_PROCESSING_CHECK_DELAY_MS = 120_000;

export function documentStatusLabel(status) {
  return {
    uploaded: "Uploaded",
    queued: "Waiting for processing",
    processing: "Processing...",
    processed: "Processed",
    failed: "Processing failed",
  }[status] || "Status unavailable";
}

export function documentProcessingCheckKey(document) {
  const id = document?._id || document?.id;
  if (!id) return null;

  const timestamp =
    document?.processingRequestedAt || document?.createdAt || "unknown";
  return `${id}:${timestamp}`;
}

export function libraryDocumentId(entry) {
  const reference = entry?.documentId ?? entry;
  const id = reference && typeof reference === "object"
    ? reference._id ?? reference.id ?? reference
    : reference;
  return id === null || id === undefined ? "" : String(id);
}

/**
 * Returns the remaining delay before the first extraction/status check.
 * The server timestamp keeps this window stable across refreshes and retries.
 */
export function documentProcessingCheckDelay(document, now = Date.now()) {
  const timestamp = document?.processingRequestedAt || document?.createdAt;
  if (!timestamp) return DOCUMENT_PROCESSING_CHECK_DELAY_MS;

  const requestedAt = new Date(timestamp).getTime();
  if (!Number.isFinite(requestedAt)) return DOCUMENT_PROCESSING_CHECK_DELAY_MS;

  return Math.max(
    0,
    requestedAt + DOCUMENT_PROCESSING_CHECK_DELAY_MS - now
  );
}

export function hasExtractedData(data) {
  if (data === null || data === undefined || data === "") return false;
  if (Array.isArray(data)) return data.length > 0;
  if (typeof data === "object") return Object.keys(data).length > 0;
  return true;
}

export function safeProcessingError(error) {
  if (typeof error !== "string" || !error.trim()) {
    return "Unable to process this document. Please try again.";
  }

  const message = error.trim();
  if (
    message.length > 240 ||
    /stack|trace|exception|api.?key|token|mongo|redis|r2|gemini|aws|cloudflare|storage|database|worker|https?:\/\/|access.?denied|status code|\bHTTP\s?\d{3}\b|\b(?:ECONN|EAI_AGAIN)\w*|\bat\s+\S+\s+\(/i.test(message) ||
    /[A-Za-z0-9_-]{48,}/.test(message)
  ) {
    return "Unable to process this document. Please try again.";
  }

  return message;
}
