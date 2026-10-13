const axios = require("axios");

const serviceUrl = (process.env.DOCUMENT_SERVICE_URL || "http://localhost:3002")
  .replace(/\/+$/u, "");
const serviceKey = process.env.PROCESSING_SERVICE_API_KEY;
const sourceTimeoutMs = Number(process.env.DOCUMENT_SOURCE_TIMEOUT_MS || 30000);
const downloadTimeoutMs = Number(process.env.DOCUMENT_DOWNLOAD_TIMEOUT_MS || 60000);
const callbackTimeoutMs = Number(process.env.PROCESSING_CALLBACK_TIMEOUT_MS || 10000);

function getHeaders() {
  if (!serviceKey) {
    throw new Error("PROCESSING_SERVICE_API_KEY must be configured.");
  }
  return { "x-processing-service-key": serviceKey };
}

async function getDocumentSource({ documentId, requestId }) {
  const response = await axios.get(
    `${serviceUrl}/internal/processing/documents/${encodeURIComponent(documentId)}/source`,
    {
      headers: getHeaders(),
      params: { requestId },
      timeout: sourceTimeoutMs,
    },
  );
  return response.data;
}

async function downloadDocument(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: downloadTimeoutMs,
    maxContentLength: 20 * 1024 * 1024,
    maxBodyLength: 20 * 1024 * 1024,
  });
  return Buffer.from(response.data);
}

async function reportProcessingResult(result) {
  const response = await axios.post(
    `${serviceUrl}/internal/processing/results`,
    result,
    {
      headers: getHeaders(),
      timeout: callbackTimeoutMs,
    },
  );
  return response.data;
}

module.exports = {
  getDocumentSource,
  downloadDocument,
  reportProcessingResult,
};
