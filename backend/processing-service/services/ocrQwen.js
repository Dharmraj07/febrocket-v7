const OpenAI = require("openai");
const { pdf } = require("pdf-to-img"); // npm i pdf-to-img

const MODEL = process.env.QWEN_OCR_MODEL || "qwen3-vl-flash";
const QWEN_BASE_URL =
    process.env.QWEN_BASE_URL ||
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

const extractionPrompt = `OCR document → ONE JSON object only.
Extract all person-relevant info (name, DOB, gender, parents, address, contact, IDs, dates, numbers, etc.).
Use descriptive keys. Dates as YYYY-MM-DD. null if missing. JSON only.`;

/* ------------------------------------------------------------------ */
/* JSON helpers                                                        */
/* ------------------------------------------------------------------ */

function extractJson(content) {
    const cleaned = content
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace < firstBrace) {
        throw new Error("Qwen returned no JSON object.");
    }

    try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    } catch (error) {
        throw new Error(`Qwen returned invalid JSON: ${error.message}`);
    }
}

function normalizeResult(result) {
    return {
        documentType: result?.documentType || "unknown",
        fields:
            result?.fields && typeof result.fields === "object"
                ? result.fields
                : {},
        documentSpecificData:
            result?.documentSpecificData &&
            typeof result.documentSpecificData === "object"
                ? result.documentSpecificData
                : {},
    };
}

/* ------------------------------------------------------------------ */
/* File-type detection                                                 */
/* ------------------------------------------------------------------ */

function isPdf(file) {
    const mime = (file?.mimetype || "").toLowerCase();
    const name = (file?.originalname || file?.name || "").toLowerCase();
    const url = (file?.sourceUrl || "").toLowerCase();
    return (
        mime === "application/pdf" ||
        name.endsWith(".pdf") ||
        url.endsWith(".pdf")
    );
}

function hasUrl(file) {
    return typeof file?.sourceUrl === "string" && file.sourceUrl.startsWith("http");
}

function hasBuffer(file) {
    return file?.buffer && Buffer.isBuffer(file.buffer);
}

/* ------------------------------------------------------------------ */
/* Content builders                                                    */
/* ------------------------------------------------------------------ */

// Single content part for images or PDF-as-file
function buildSinglePart(file) {
    if (hasUrl(file)) {
        return isPdf(file)
            ? {
                  type: "file",
                  file: {
                      filename: file.originalname || "document.pdf",
                      file_data: file.sourceUrl,
                  },
              }
            : {
                  type: "image_url",
                  image_url: { url: file.sourceUrl },
              };
    }

    const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString(
        "base64"
    )}`;

    if (isPdf(file)) {
        return {
            type: "file",
            file: {
                filename: file.originalname || "document.pdf",
                file_data: dataUrl,
            },
        };
    }

    return { type: "image_url", image_url: { url: dataUrl } };
}

// Fallback: convert PDF buffer → one image part per page
async function pdfBufferToImageParts(buffer) {
    const parts = [];
    const doc = await pdf(buffer, { scale: 2 });
    for await (const page of doc) {
        parts.push({
            type: "image_url",
            image_url: {
                url: `data:image/png;base64,${page.toString("base64")}`,
            },
        });
    }
    if (!parts.length) throw new Error("PDF contained no renderable pages.");
    return parts;
}

/* ------------------------------------------------------------------ */
/* Main entry                                                          */
/* ------------------------------------------------------------------ */

async function processDocumentWithOCR(file) {
    if (!hasBuffer(file) && !hasUrl(file)) {
        throw new Error("Invalid uploaded file: need buffer or sourceUrl.");
    }

    if (!process.env.DASHSCOPE_API_KEY) {
        throw new Error("DASHSCOPE_API_KEY environment variable is not set.");
    }

    const openai = new OpenAI({
        apiKey: process.env.DASHSCOPE_API_KEY,
        baseURL: QWEN_BASE_URL,
    });

    // Primary attempt: send as a single content part (file for PDF, image for image)
    async function callQwen(contentParts) {
        const response = await openai.chat.completions.create({
            model: MODEL,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: extractionPrompt },
                        ...contentParts,
                    ],
                },
            ],
            stream: false,
            temperature: 0.1,
            max_tokens: 4096,
            response_format: { type: "json_object" },
        });

        const content = response.choices?.[0]?.message?.content;
        if (!content || typeof content !== "string") {
            throw new Error("Qwen returned an empty response.");
        }
        return normalizeResult(extractJson(content));
    }

    try {
        return await callQwen([buildSinglePart(file)]);
    } catch (error) {
        // If the API rejected the "file" content type for a PDF,
        // fall back to rendering the PDF locally and sending images.
        const isUnsupportedContentType =
            error.status === 400 &&
            /unsupported|content type|file/i.test(error.message || "");

        if (isPdf(file) && isUnsupportedContentType && hasBuffer(file)) {
            console.warn(
                "Qwen rejected PDF 'file' part — falling back to image rendering."
            );
            try {
                const imageParts = await pdfBufferToImageParts(file.buffer);
                return await callQwen(imageParts);
            } catch (fallbackError) {
                console.error("PDF→image fallback failed:", fallbackError.message);
                throw new Error(
                    `Failed to process PDF with Qwen OCR (fallback): ${fallbackError.message}`
                );
            }
        }

        // Remote PDF fallback: download then render
        if (isPdf(file) && isUnsupportedContentType && hasUrl(file)) {
            console.warn(
                "Qwen rejected remote PDF 'file' part — downloading + rendering."
            );
            try {
                const res = await fetch(file.sourceUrl);
                if (!res.ok) {
                    throw new Error(`Download failed: ${res.status}`);
                }
                const arrayBuf = await res.arrayBuffer();
                const imageParts = await pdfBufferToImageParts(
                    Buffer.from(arrayBuf)
                );
                return await callQwen(imageParts);
            } catch (fallbackError) {
                console.error(
                    "Remote PDF→image fallback failed:",
                    fallbackError.message
                );
                throw new Error(
                    `Failed to process remote PDF with Qwen OCR (fallback): ${fallbackError.message}`
                );
            }
        }

        console.error("Qwen document OCR failed:", {
            message: error.message,
            status: error.status,
            code: error.code,
        });

        if (error.status === 401) throw new Error("Invalid DashScope API key.");
        if (error.status === 429) throw new Error("Qwen rate limit exceeded.");
        if (error.name === "AbortError" || error.code === "ETIMEDOUT") {
            throw new Error("Qwen OCR request timed out.");
        }

        throw new Error(
            `Failed to process document with Qwen OCR: ${error.message}`
        );
    }
}

/* ------------------------------------------------------------------ */

module.exports = {
    processDocumentWithOCR,
    extractJson,
};