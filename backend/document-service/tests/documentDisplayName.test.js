const test = require("node:test");
const assert = require("node:assert/strict");
const Document = require("../models/Document");
const r2Service = require("../services/r2Service");
const imageProcessing = require("../services/imageProcessing");
const { uploadDocument } = require("../services/documentService");

function replace(target, key, value) {
  const original = target[key];
  target[key] = value;
  return () => {
    target[key] = original;
  };
}

test("upload initializes displayName from the original filename", async () => {
  let createdFields;
  const restores = [
    replace(imageProcessing, "optimizeImage", async (file) => ({
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.buffer.length,
      optimized: false,
    })),
    replace(r2Service, "uploadFileToR2", async () => {}),
    replace(r2Service, "getPublicFileUrl", () => null),
    replace(Document, "create", async (fields) => {
      createdFields = fields;
      return fields;
    }),
  ];
  const originalInfo = console.info;
  console.info = () => {};

  try {
    await uploadDocument({
      userId: "user-1",
      file: {
        originalname: "whatsapp.jpeg",
        mimetype: "image/jpeg",
        buffer: Buffer.from("image"),
      },
    });
    assert.equal(createdFields.fileName, "whatsapp.jpeg");
    assert.equal(createdFields.displayName, "whatsapp.jpeg");
  } finally {
    console.info = originalInfo;
    restores.reverse().forEach((restore) => restore());
  }
});
