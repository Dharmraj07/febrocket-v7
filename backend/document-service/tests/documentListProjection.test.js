const test = require("node:test");
const assert = require("node:assert/strict");

const Document = require("../models/Document");
const { listDocuments } = require("../services/documentService");
const { listAllDocuments } = require("../services/adminDocumentService");

function createQuery(result, captured) {
  return {
    sort(value) {
      captured.sort = value;
      return this;
    },
    skip(value) {
      captured.skip = value;
      return this;
    },
    limit(value) {
      captured.limit = value;
      return this;
    },
    select(value) {
      captured.projection = value;
      return this;
    },
    lean() {
      return Promise.resolve(result);
    },
  };
}

for (const [name, list] of [
  ["user", listDocuments],
  ["admin", listAllDocuments],
]) {
  test(`${name} document lists omit large extracted payloads`, async () => {
    const originalFind = Document.find;
    const originalCount = Document.countDocuments;
    const captured = {};
    const documents = [{
      _id: "document-1",
      status: "processed",
      fileName: "scan.pdf",
      displayName: "10th Class Marksheet - JAC - 2015",
    }];
    Document.find = (filter) => {
      captured.filter = filter;
      return createQuery(documents, captured);
    };
    Document.countDocuments = async () => 1;

    try {
      const result = name === "user"
        ? await list({ userId: "user-1", page: 1, limit: 20 })
        : await list({ page: 1, limit: 20 });

      assert.equal(captured.projection, "-data -rawText");
      assert.deepEqual(captured.sort, { createdAt: -1 });
      assert.deepEqual(result.documents, documents);
      assert.equal(result.documents[0].displayName, "10th Class Marksheet - JAC - 2015");
      assert.equal(result.pagination.total, 1);
    } finally {
      Document.find = originalFind;
      Document.countDocuments = originalCount;
    }
  });
}

test("admin document search matches original and generated display names", async () => {
  const originalFind = Document.find;
  const originalCount = Document.countDocuments;
  let capturedFilter;
  Document.find = (filter) => {
    capturedFilter = filter;
    return createQuery([], {});
  };
  Document.countDocuments = async () => 0;

  try {
    await listAllDocuments({ page: 1, limit: 20, q: "JAC 2015" });
    assert.deepEqual(capturedFilter.$or, [
      { fileName: { $regex: "JAC 2015", $options: "i" } },
      { displayName: { $regex: "JAC 2015", $options: "i" } },
    ]);
  } finally {
    Document.find = originalFind;
    Document.countDocuments = originalCount;
  }
});
