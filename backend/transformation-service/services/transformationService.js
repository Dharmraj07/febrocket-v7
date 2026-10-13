const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const axios = require("axios");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");
const { fileTypeFromBuffer } = require("file-type");
const { validateRequirements, buildPlan, getFormatLabel } = require("../utils/requirements");

const TEMP_DIRECTORY = path.join(os.tmpdir(), "transformation-service");

function generateJobId(prefix = "tr") {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function normalizeDocumentInfo(input = {}) {
  const info = { ...input };
  const format = getFormatLabel(info.format || info.mimeType || "");
  if (format) {
    info.format = format;
  }
  if (info.mimeType && !info.format) {
    info.format = getFormatLabel(info.mimeType.split("/")[1]);
  }
  return info;
}

async function fetchRemoteFile(sourceUrl) {
  if (!sourceUrl) {
    throw new Error("A source URL is required.");
  }

  const response = await axios.get(sourceUrl, {
    responseType: "arraybuffer",
    timeout: 30000,
    maxRedirects: 5,
  });

  return Buffer.from(response.data);
}

async function analyzeDocument(sourceBuffer, sourceName = "document") {
  const detected = await fileTypeFromBuffer(sourceBuffer);
  const fileName = String(sourceName || "document").toLowerCase();
  const ext = path.extname(fileName).slice(1);
  const mimeType = detected?.mime || "application/octet-stream";
  const format = getFormatLabel(detected?.ext || ext || mimeType.split("/")[1] || "unknown");

  const info = {
    format,
    mimeType,
    size: Buffer.byteLength(sourceBuffer),
    sourceName,
  };

  if (mimeType.startsWith("image/")) {
    try {
      const metadata = await sharp(sourceBuffer).metadata();
      Object.assign(info, {
        width: metadata.width || null,
        height: metadata.height || null,
        channels: metadata.channels || null,
        depth: metadata.depth || null,
        orientation: metadata.orientation || null,
      });
    } catch (error) {
      info.analysisError = "Unable to read image metadata.";
    }
  }

  if (mimeType === "application/pdf" || sourceBuffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    info.format = "pdf";
    info.mimeType = "application/pdf";
    try {
      const pdf = await PDFDocument.load(sourceBuffer, { ignoreEncryption: true });
      info.pageCount = pdf.getPageCount();
    } catch (error) {
      info.pageCount = null;
      info.analysisError = info.analysisError || "Unable to read PDF metadata.";
    }
  }

  return normalizeDocumentInfo(info);
}

async function analyzeSourceDocument({ sourceUrl, sourceBuffer, sourceName, requirements }) {
  const buffer = sourceBuffer || (sourceUrl ? await fetchRemoteFile(sourceUrl) : null);
  if (!buffer) {
    throw new Error("No source document payload was supplied.");
  }

  const documentInfo = await analyzeDocument(buffer, sourceName || "document");
  const output = {
    source: {
      sourceUrl: sourceUrl || null,
      sourceName: sourceName || documentInfo.sourceName || "document",
    },
    ...documentInfo,
  };

  if (requirements) {
    output.validation = validateRequirements(documentInfo, requirements);
    output.plan = buildPlan(documentInfo, requirements);
  }

  return output;
}

async function createTemporaryFile(buffer, suffix = ".bin") {
  await fs.mkdir(TEMP_DIRECTORY, { recursive: true });
  const filename = `${crypto.randomUUID()}${suffix}`;
  const filePath = path.join(TEMP_DIRECTORY, filename);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

async function removeTemporaryFile(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // cleanup is best-effort; a temporary file should not block the response.
  }
}

async function performTransformation(documentInfo, requirements, options = {}) {
  const plannedOperations = buildPlan(documentInfo, requirements);
  const normalized = normalizeDocumentInfo(documentInfo);
  const output = {
    format: normalized.format || "unknown",
    mimeType: normalized.mimeType || "application/octet-stream",
    size: normalized.size || 0,
    operations: plannedOperations,
    validation: validateRequirements(normalized, requirements),
  };

  if (plannedOperations.length === 0) {
    output.status = "compatible";
    return output;
  }

  const fallback = {
    format: requirements.format || normalized.format,
    mimeType: requirements.format === "pdf" ? "application/pdf" : `image/${requirements.format || normalized.format}`,
    size: normalized.size,
  };

  output.output = fallback;
  output.status = "transformation-required";
  output.jobId = options.jobId || generateJobId();
  return output;
}

module.exports = {
  generateJobId,
  analyzeDocument,
  analyzeSourceDocument,
  createTemporaryFile,
  removeTemporaryFile,
  performTransformation,
  fetchRemoteFile,
};
