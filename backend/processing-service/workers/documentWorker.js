const { Worker } = require("bullmq");
const config = require("../config");
const documentServiceClient = require("../services/documentServiceClient");
const geminiService = require("../services/geminiService");
const { generateDocumentDisplayName } = require("../helpers/documentDisplayName");
const { getRedisConnectionOptions } = require("../helpers/redis");

const SAFE_PROCESSING_ERROR = "Unable to process this document. Please try again.";

async function processDocument(job) {
  const { documentId, requestId } = job.data;
  try {
    const source = await documentServiceClient.getDocumentSource({ documentId, requestId });
    if (source.alreadyProcessed || source.ignored) return;
    if (!source.document?.signedUrl) {
      throw new Error("Document Service returned no source URL for processing.");
    }

    const buffer = await documentServiceClient.downloadDocument(source.document.signedUrl);
    const extractedData = await geminiService.processDocumentWithGemini({
      buffer,
      mimetype: source.document.fileType,
      originalname: source.document.fileName,
    });

    await documentServiceClient.reportProcessingResult({
      documentId,
      requestId,
      event: "completed",
      data: extractedData,
      displayName: generateDocumentDisplayName(
        extractedData,
        source.document.fileName,
      ),
    });
  } catch (error) {
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts || 1);
    try {
      await documentServiceClient.reportProcessingResult({
        documentId,
        requestId,
        event: isFinalAttempt ? "failed" : "retrying",
      });
    } catch (reportError) {
      console.error("Unable to update document processing status:", {
        documentId,
        error: reportError.name,
      });
    }
    if (isFinalAttempt) {
      console.error("Document processing exhausted retries:", {
        documentId,
        error: error.name,
      });
      throw new Error(SAFE_PROCESSING_ERROR);
    }
    const retryError = new Error(SAFE_PROCESSING_ERROR);
    retryError.name = error.name || "Error";
    throw retryError;
  }
}

function startDocumentWorker() {
  const worker = new Worker("document-processing", processDocument, {
    connection: getRedisConnectionOptions(),
    concurrency: config.workerConcurrency,
  });

  worker.on("completed", (job) => {
    console.log(`Document processing completed: ${job.data.documentId}`);
  });
  worker.on("failed", (job, error) => {
    if (!job) return;
    console.error(`Document processing failed: ${job.data.documentId}`, error.name);
  });
  worker.on("error", (error) => {
    console.error("Processing worker error:", error.message);
  });

  return worker;
}

module.exports = { startDocumentWorker, processDocument };
