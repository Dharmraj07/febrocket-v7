const test = require("node:test");
const assert = require("node:assert/strict");
const Document = require("../models/Document");
const DocumentLibrary = require("../models/DocumentLibrary");
const r2Service = require("../services/r2Service");
const documentService = require("../services/documentService");
const adminDocumentService = require("../services/adminDocumentService");
const libraryService = require("../services/documentLibraryService");

function replace(target, key, value) {
  const original = target[key];
  target[key] = value;
  return () => {
    target[key] = original;
  };
}

test("user deletion removes the reference and deletes only affected empty libraries", async () => {
  const deletedDocument = {
    _id: "document-1",
    userId: "user-1",
    storageKey: "users/user-1/file.pdf",
  };
  const operations = [];
  const restores = [
    replace(Document, "findOneAndDelete", async (filter) => {
      operations.push(["delete-document", filter]);
      return deletedDocument;
    }),
    replace(r2Service, "deleteFileFromR2", async (storageKey) => {
      operations.push(["delete-file", storageKey]);
    }),
    replace(DocumentLibrary, "find", (filter) => {
      operations.push(["find-libraries", filter]);
      return {
        select(selection) {
          operations.push(["select-libraries", selection]);
          return this;
        },
        lean: async () => [{ _id: "person-library" }, { _id: "uncategorized-library" }],
      };
    }),
    replace(DocumentLibrary, "updateMany", async (...args) => {
      operations.push(["pull-reference", ...args]);
      return { modifiedCount: 2 };
    }),
    replace(DocumentLibrary, "deleteMany", async (filter) => {
      operations.push(["delete-empty-libraries", filter]);
      return { modifiedCount: 1 };
    }),
  ];

  try {
    assert.equal(
      await documentService.deleteDocument({
        documentId: "document-1",
        userId: "user-1",
        storageKey: deletedDocument.storageKey,
      }),
      true,
    );
    assert.deepEqual(operations, [
      ["delete-document", { _id: "document-1", userId: "user-1" }],
      ["delete-file", "users/user-1/file.pdf"],
      [
        "find-libraries",
        {
          userId: "user-1",
          "documents.documentId": "document-1",
        },
      ],
      ["select-libraries", "_id"],
      [
        "pull-reference",
        {
          _id: { $in: ["person-library", "uncategorized-library"] },
          userId: "user-1",
          "documents.documentId": "document-1",
        },
        {
          $pull: {
            documents: {
              documentId: "document-1",
            },
          },
        },
      ],
      [
        "delete-empty-libraries",
        {
          userId: "user-1",
          documents: { $size: 0 },
        },
      ],
    ]);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("document reference cleanup queries cast against the embedded-reference schema", () => {
  const documentId = "507f1f77bcf86cd799439011";
  const userId = "507f1f77bcf86cd799439012";
  const libraryId = "507f1f77bcf86cd799439013";
  const filter = {
    _id: { $in: [libraryId] },
    userId,
    "documents.documentId": documentId,
  };
  const update = { $pull: { documents: { documentId } } };

  DocumentLibrary.find({ userId, "documents.documentId": documentId })
    .cast(DocumentLibrary);
  DocumentLibrary.updateMany(filter, update).cast(DocumentLibrary);
  DocumentLibrary.deleteMany({ userId, documents: { $size: 0 } })
    .cast(DocumentLibrary);
});

test("admin deletion removes the reference and deletes only the owner's empty libraries", async () => {
  const deletedDocument = {
    _id: "document-2",
    userId: "owner-2",
    storageKey: "users/owner-2/file.pdf",
    toObject() {
      return {
        _id: this._id,
        userId: this.userId,
        storageKey: this.storageKey,
      };
    },
  };
  const operations = [];
  const restores = [
    replace(Document, "findByIdAndDelete", async (documentId) => {
      operations.push(["delete-document", documentId]);
      return deletedDocument;
    }),
    replace(r2Service, "deleteFileFromR2", async (storageKey) => {
      operations.push(["delete-file", storageKey]);
    }),
    replace(DocumentLibrary, "find", (filter) => {
      operations.push(["find-libraries", filter]);
      return {
        select(selection) {
          operations.push(["select-libraries", selection]);
          return this;
        },
        lean: async () => [{ _id: "owner-person-library" }],
      };
    }),
    replace(DocumentLibrary, "updateMany", async (...args) => {
      operations.push(["pull-reference", ...args]);
      return { modifiedCount: 1 };
    }),
    replace(DocumentLibrary, "deleteMany", async (filter) => {
      operations.push(["delete-empty-libraries", filter]);
      return { modifiedCount: 1 };
    }),
  ];

  try {
    assert.equal(
      await adminDocumentService.adminDeleteDocument({ documentId: "document-2" }),
      deletedDocument,
    );
    assert.deepEqual(operations, [
      ["delete-document", "document-2"],
      ["delete-file", "users/owner-2/file.pdf"],
      [
        "find-libraries",
        {
          userId: "owner-2",
          "documents.documentId": "document-2",
        },
      ],
      ["select-libraries", "_id"],
      [
        "pull-reference",
        {
          _id: { $in: ["owner-person-library"] },
          userId: "owner-2",
          "documents.documentId": "document-2",
        },
        {
          $pull: {
            documents: {
              documentId: "document-2",
            },
          },
        },
      ],
      [
        "delete-empty-libraries",
        {
          userId: "owner-2",
          documents: { $size: 0 },
        },
      ],
    ]);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("failed R2 deletion restores the document and leaves library references intact", async () => {
  const deletedDocument = {
    _id: "document-3",
    userId: "user-3",
    storageKey: "users/user-3/file.pdf",
    toObject() {
      return { _id: this._id, userId: this.userId, storageKey: this.storageKey };
    },
  };
  const operations = [];
  const restores = [
    replace(Document, "findOneAndDelete", async () => deletedDocument),
    replace(Document, "create", async (document) => {
      operations.push(["restore-document", document]);
    }),
    replace(r2Service, "deleteFileFromR2", async () => {
      throw new Error("R2 unavailable");
    }),
  ];

  try {
    await assert.rejects(
      documentService.deleteDocument({
        documentId: "document-3",
        userId: "user-3",
        storageKey: deletedDocument.storageKey,
      }),
      /R2 unavailable/,
    );
    assert.deepEqual(operations, [
      ["restore-document", deletedDocument.toObject()],
    ]);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("reference cleanup deletes empty owner libraries even when no reference matches", async () => {
  const originalFind = DocumentLibrary.find;
  const originalUpdateMany = DocumentLibrary.updateMany;
  const originalDeleteMany = DocumentLibrary.deleteMany;
  const operations = [];
  DocumentLibrary.find = (filter) => {
    operations.push(["find", filter]);
    return {
      select() {
        return this;
      },
      lean: async () => [],
    };
  };
  DocumentLibrary.updateMany = async (...args) => {
    operations.push(["pull", ...args]);
  };
  DocumentLibrary.deleteMany = async (...args) => {
    operations.push(["delete-empty", ...args]);
  };

  try {
    await libraryService.removeDocumentReferences({
      documentId: "document-4",
      userId: "user-4",
    });
    assert.deepEqual(operations, [
      [
        "find",
        {
          userId: "user-4",
          "documents.documentId": "document-4",
        },
      ],
      ["delete-empty", { userId: "user-4", documents: { $size: 0 } }],
    ]);
  } finally {
    DocumentLibrary.find = originalFind;
    DocumentLibrary.updateMany = originalUpdateMany;
    DocumentLibrary.deleteMany = originalDeleteMany;
  }
});

test("reference cleanup keeps libraries with remaining documents and other users' libraries", async () => {
  const originalFind = DocumentLibrary.find;
  const originalUpdateMany = DocumentLibrary.updateMany;
  const originalDeleteMany = DocumentLibrary.deleteMany;
  const libraries = [
    { _id: "person-with-other-docs", userId: "user-5", documents: [{ documentId: "deleted" }, { documentId: "remaining" }] },
    { _id: "uncategorized-last-doc", userId: "user-5", documents: [{ documentId: "deleted" }] },
    { _id: "other-user-library", userId: "user-6", documents: [{ documentId: "deleted" }] },
    { _id: "unrelated-library", userId: "user-5", documents: [{ documentId: "unrelated" }] },
    { _id: "already-empty-library", userId: "user-5", documents: [] },
  ];
  const matchesIds = (library, ids) => ids.$in.includes(library._id);

  DocumentLibrary.find = ({ userId, "documents.documentId": documentId }) => ({
    select() {
      return this;
    },
    lean: async () => libraries
      .filter((library) => (
        library.userId === userId &&
        library.documents.some((entry) => entry.documentId === documentId)
      ))
      .map(({ _id }) => ({ _id })),
  });
  DocumentLibrary.updateMany = async (filter, update) => {
    for (const library of libraries) {
      if (
        matchesIds(library, filter._id) &&
        library.userId === filter.userId &&
        library.documents.some((entry) => entry.documentId === filter["documents.documentId"])
      ) {
        library.documents = library.documents.filter(
          (entry) => entry.documentId !== update.$pull.documents.documentId,
        );
      }
    }
  };
  DocumentLibrary.deleteMany = async (filter) => {
    for (let index = libraries.length - 1; index >= 0; index -= 1) {
      const library = libraries[index];
      if (
        library.userId === filter.userId &&
        filter.documents.$size === library.documents.length
      ) {
        libraries.splice(index, 1);
      }
    }
  };

  try {
    await libraryService.removeDocumentReferences({
      documentId: "deleted",
      userId: "user-5",
    });
    assert.deepEqual(libraries, [
      { _id: "person-with-other-docs", userId: "user-5", documents: [{ documentId: "remaining" }] },
      { _id: "other-user-library", userId: "user-6", documents: [{ documentId: "deleted" }] },
      { _id: "unrelated-library", userId: "user-5", documents: [{ documentId: "unrelated" }] },
    ]);
  } finally {
    DocumentLibrary.find = originalFind;
    DocumentLibrary.updateMany = originalUpdateMany;
    DocumentLibrary.deleteMany = originalDeleteMany;
  }
});
