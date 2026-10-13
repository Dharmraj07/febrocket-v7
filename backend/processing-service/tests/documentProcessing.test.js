const test = require("node:test");
const assert = require("node:assert/strict");
const documentServiceClient = require("../services/documentServiceClient");
const geminiService = require("../services/geminiService");
const { processDocument } = require("../workers/documentWorker");
const { generateDocumentDisplayName } = require("../helpers/documentDisplayName");
const { normalizeExtractionResult } = require("../services/geminiService");
const { createHealthServer } = require("../server");

function replace(target, key, value) {
  const original = target[key];
  target[key] = value;
  return () => {
    target[key] = original;
  };
}

test("health endpoint reports Processing-Service status", async () => {
  const server = createHealthServer();

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(
      {
        success: body.success,
        service: body.service,
        status: body.status,
      },
      {
        success: true,
        service: "processing-service",
        status: "ok",
      },
    );
    assert.ok(Number.isFinite(Date.parse(body.timestamp)));
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("display name includes document type, issuer, and year", () => {
  assert.equal(
    generateDocumentDisplayName(
      {
        document: { documentType: "10th Marksheet" },
        examDetails: { boardName: "JAC", yearOfPassing: "2015" },
      },
      "whatsapp.jpeg",
    ),
    "10th Class Marksheet - JAC - 2015",
  );
});

test("display name keeps the original filename when extracted type is unknown", () => {
  assert.equal(
    generateDocumentDisplayName({ document: { documentType: "unknown" } }, "scan.pdf"),
    "scan.pdf",
  );
});

test("normalizes extracted person identification without losing other data", () => {
  const input = {
    document: { documentType: "Invoice", lineItems: [{ total: 12 }] },
  };
  assert.deepEqual(normalizeExtractionResult(input), {
    ...input,
    person: { identificationStatus: "unavailable", persons: [] },
  });
  assert.deepEqual(
    normalizeExtractionResult({
      person: { fullName: "Krishna Kumar Tudu", identificationStatus: "identified" },
      document: { documentType: "Certificate" },
    }).person.persons,
    [{ fullName: "Krishna Kumar Tudu" }],
  );
});

test("worker retrieves file through Document-Service and reports extracted result", async () => {
  const extraction = {
    person: { identificationStatus: "identified", persons: [{ fullName: "Krishna" }] },
    document: { documentType: "Certificate" },
  };
  const calls = [];
  const restores = [
    replace(documentServiceClient, "getDocumentSource", async (input) => {
      calls.push(["source", input]);
      return {
        document: {
          fileName: "scan.pdf",
          fileType: "application/pdf",
          signedUrl: "https://signed.example/temporary",
        },
      };
    }),
    replace(documentServiceClient, "downloadDocument", async (url) => {
      calls.push(["download", url]);
      return Buffer.from("pdf");
    }),
    replace(geminiService, "processDocumentWithGemini", async (file) => {
      calls.push(["gemini", file]);
      return extraction;
    }),
    replace(documentServiceClient, "reportProcessingResult", async (result) => {
      calls.push(["result", result]);
      return { success: true };
    }),
  ];

  try {
    await processDocument({
      data: { documentId: "document-1", requestId: "2026-10-05T10:00:00.000Z" },
      attemptsMade: 0,
      opts: { attempts: 3 },
    });
    assert.deepEqual(calls[0], [
      "source",
      { documentId: "document-1", requestId: "2026-10-05T10:00:00.000Z" },
    ]);
    assert.equal(calls[1][1], "https://signed.example/temporary");
    assert.deepEqual(calls[2][1], {
      buffer: Buffer.from("pdf"),
      mimetype: "application/pdf",
      originalname: "scan.pdf",
    });
    assert.equal(calls[3][1].event, "completed");
    assert.equal(calls[3][1].displayName, "Certificate");
    assert.deepEqual(calls[3][1].data, extraction);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("worker reports failure after the final processing attempt", async () => {
  const events = [];
  const restores = [
    replace(documentServiceClient, "getDocumentSource", async () => {
      throw new Error("Temporary source error");
    }),
    replace(documentServiceClient, "reportProcessingResult", async (result) => {
      events.push(result.event);
      return { success: true };
    }),
  ];

  try {
    await assert.rejects(
      processDocument({
        data: { documentId: "document-1", requestId: "2026-10-05T10:00:00.000Z" },
        attemptsMade: 2,
        opts: { attempts: 3 },
      }),
      /Unable to process this document/,
    );
    assert.deepEqual(events, ["failed"]);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
