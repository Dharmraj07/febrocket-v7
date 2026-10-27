const { mock, test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const config = require("../config");
const app = require("../app");
const Document = require("../models/Document");
const DocumentLibrary = require("../models/DocumentLibrary");
const { normalizePersonName } = require("../helpers/personName");
const libraryService = require("../services/documentLibraryService");

test("person name normalization collapses whitespace and case consistently", () => {
  assert.equal(normalizePersonName(" Krishna   Kumar Tudu "), "krishna kumar tudu");
  assert.equal(normalizePersonName("KRISHNA KUMAR TUDU"), "krishna kumar tudu");
  assert.equal(normalizePersonName("  "), "");
});

test("resolve atomically upserts by authenticated user and normalized name", async () => {
  const original = DocumentLibrary.findOneAndUpdate;
  let captured;
  const result = { _id: "library-1", name: "Krishna Kumar Tudu" };
  DocumentLibrary.findOneAndUpdate = async (...args) => {
    captured = args;
    return result;
  };

  try {
    assert.equal(
      await libraryService.findOrCreateDocumentLibrary({
        userId: "user-1",
        name: " krishna   kumar tudu ",
      }),
      result,
    );
    assert.deepEqual(captured[0], {
      userId: "user-1",
      normalizedName: "krishna kumar tudu",
    });
    assert.deepEqual(captured[1].$setOnInsert, {
      userId: "user-1",
      name: "krishna kumar tudu",
      normalizedName: "krishna kumar tudu",
      documents: [],
    });
    assert.equal(captured[2].upsert, true);
  } finally {
    DocumentLibrary.findOneAndUpdate = original;
  }
});

test("resolve handles a concurrent unique-index conflict by reading the winner", async () => {
  const originalUpdate = DocumentLibrary.findOneAndUpdate;
  const originalFind = DocumentLibrary.findOne;
  const winner = { _id: "existing-library" };
  let findFilter;
  DocumentLibrary.findOneAndUpdate = async () => {
    const error = new Error("duplicate key");
    error.code = 11000;
    throw error;
  };
  DocumentLibrary.findOne = async (filter) => {
    findFilter = filter;
    return winner;
  };

  try {
    assert.equal(
      await libraryService.findOrCreateDocumentLibrary({
        userId: "user-1",
        name: "KRISHNA KUMAR TUDU",
      }),
      winner,
    );
    assert.deepEqual(findFilter, {
      userId: "user-1",
      normalizedName: "krishna kumar tudu",
    });
  } finally {
    DocumentLibrary.findOneAndUpdate = originalUpdate;
    DocumentLibrary.findOne = originalFind;
  }
});

test("attach checks document ownership and updates only the user's library idempotently", async () => {
  const originalFind = Document.findOne;
  const originalUpdate = DocumentLibrary.findOneAndUpdate;
  const operations = [];
  let documentExists = false;
  Document.findOne = (filter) => {
    operations.push(["find-document", filter]);
    return {
      select(selection) {
        operations.push(["select", selection]);
        return this;
      },
      lean: async () => documentExists
        ? {
            _id: filter._id,
            fileType: "application/pdf",
            fileSize: 2048,
            data: { document: { documentType: "Aadhaar" }, fields: { fullName: "A Person" } },
          }
        : null,
    };
  };
  DocumentLibrary.findOneAndUpdate = async (...args) => {
    operations.push(["update-library", ...args]);
    return args[1].$push
      ? { _id: "library-1", documents: [args[1].$push.documents] }
      : null;
  };

  try {
    await assert.rejects(
      libraryService.attachDocument({
        libraryId: "library-1",
        documentId: "document-1",
        userId: "user-1",
      }),
      { status: 404 },
    );
    assert.deepEqual(operations[0], [
      "find-document",
      { _id: "document-1", userId: "user-1" },
    ]);

    documentExists = true;
    const library = await libraryService.attachDocument({
      libraryId: "library-1",
      documentId: "document-1",
      userId: "user-1",
    });
    assert.deepEqual(library, {
      _id: "library-1",
      documents: [{
        documentId: "document-1",
        fileType: "application/pdf",
        fileSize: 2048,
        documentType: "Aadhaar",
        data: { document: { documentType: "Aadhaar" }, fields: { fullName: "A Person" } },
      }],
    });
    const pushOperation = operations.find((operation) => operation[2]?.$push);
    assert.deepEqual(pushOperation[2].$push.documents, {
      documentId: "document-1",
      fileType: "application/pdf",
      fileSize: 2048,
      documentType: "Aadhaar",
      data: { document: { documentType: "Aadhaar" }, fields: { fullName: "A Person" } },
    });
    assert.equal(operations.find((operation) => operation[0] === "select")[1], "data fileType fileSize");
  } finally {
    Document.findOne = originalFind;
    DocumentLibrary.findOneAndUpdate = originalUpdate;
  }
});

test("attach reports a missing user library without exposing another user's record", async () => {
  const originalFind = Document.findOne;
  const originalUpdate = DocumentLibrary.findOneAndUpdate;
  const filters = [];
  Document.findOne = () => ({
    select() {
      return this;
    },
    lean: async () => ({
      _id: "document-1",
      fileType: "application/pdf",
      fileSize: 2048,
      data: { document: { documentType: "Aadhaar" } },
    }),
  });
  DocumentLibrary.findOneAndUpdate = async (query) => {
    filters.push(query);
    return null;
  };

  try {
    await assert.rejects(
      libraryService.attachDocument({
        libraryId: "library-1",
        documentId: "document-1",
        userId: "user-1",
      }),
      { status: 404 },
    );
    assert.equal(filters.length, 3);
    assert.equal(filters[0]._id, "library-1");
    assert.equal(filters[0].userId, "user-1");
    assert.deepEqual(filters[1], {
      _id: "library-1",
      userId: "user-1",
      "documents.documentId": { $ne: "document-1" },
    });
  } finally {
    Document.findOne = originalFind;
    DocumentLibrary.findOneAndUpdate = originalUpdate;
  }
});

test("library document listing scopes both library and document queries by user", async () => {
  const originalLibraryFind = DocumentLibrary.findOne;
  const originalDocumentFind = Document.find;
  const library = {
    _id: "library-1",
    userId: "user-1",
    documents: [{
      documentId: "document-1",
      documentType: "Aadhaar",
      data: {},
    }],
  };
  const documents = [{ _id: "document-1", userId: "user-1" }];
  let libraryFilter;
  let documentFilter;
  DocumentLibrary.findOne = (filter) => {
    libraryFilter = filter;
    return { lean: async () => library };
  };
  Document.find = (filter) => {
    documentFilter = filter;
    return {
      sort() {
        return this;
      },
      lean: async () => documents,
    };
  };

  try {
    assert.deepEqual(
      await libraryService.getLibraryDocuments({
        libraryId: "library-1",
        userId: "user-1",
      }),
      { library, documents },
    );
    assert.deepEqual(libraryFilter, { _id: "library-1", userId: "user-1" });
    assert.deepEqual(documentFilter, {
      _id: { $in: ["document-1"] },
      userId: "user-1",
    });
  } finally {
    DocumentLibrary.findOne = originalLibraryFind;
    Document.find = originalDocumentFind;
  }
});

test("renaming maps duplicate normalized names to a conflict", async () => {
  const original = DocumentLibrary.findOneAndUpdate;
  DocumentLibrary.findOneAndUpdate = async () => {
    const error = new Error("duplicate key");
    error.code = 11000;
    throw error;
  };

  try {
    await assert.rejects(
      libraryService.updateLibraryName({
        libraryId: "library-1",
        userId: "user-1",
        name: " KRISHNA   KUMAR TUDU ",
      }),
      { status: 409 },
    );
  } finally {
    DocumentLibrary.findOneAndUpdate = original;
  }
});

test("processing sync attaches one document to each distinct identified person", async () => {
  const originalFind = Document.findOne;
  const originalUpdate = DocumentLibrary.findOneAndUpdate;
  const operations = [];
  let sequence = 0;
  let documentData;
  Document.findOne = (filter) => ({
    select() {
      return this;
    },
    lean: async () => {
      operations.push(["check-document", filter.userId]);
      return {
        _id: filter._id,
        fileType: "application/pdf",
        fileSize: 2048,
        data: documentData,
      };
    },
  });
  DocumentLibrary.findOneAndUpdate = async (filter, update) => {
    operations.push([filter, update]);
    if (update.$setOnInsert) {
      return {
        _id: `library-${++sequence}`,
        name: update.$setOnInsert.name,
      };
    }
    if (update.$push) {
      return { _id: filter._id, documents: [update.$push.documents] };
    }
    return null;
  };

  try {
    documentData = {
      person: {
        identificationStatus: "identified",
        persons: [
          { fullName: "Krishna Kumar Tudu" },
          { fullName: "Dharm Raj Hembram" },
        ],
      },
      document: { documentType: "Certificate" },
    };
    const libraries = await libraryService.syncDocumentToLibraries({
      userId: "user-1",
      documentId: "document-1",
      extractedData: documentData,
    });

    assert.equal(libraries.length, 2);
    assert.equal(operations.filter((operation) => operation[0] === "check-document").length, 2);
    assert.equal(operations.filter((operation) => operation[1]?.$setOnInsert).length, 2);
    assert.equal(
      operations.filter((operation) => operation[1]?.$push).every(
        (operation) => operation[1].$push.documents.documentType === "Certificate",
      ),
      true,
    );
    assert.equal(
      operations.filter((operation) => operation[1]?.$push).every(
        (operation) => operation[1].$push.documents.fileType === "application/pdf" &&
          operation[1].$push.documents.fileSize === 2048 &&
          operation[1].$push.documents.documentId === "document-1" &&
          operation[1].$push.documents.data === documentData,
      ),
      true,
    );

    operations.length = 0;
    documentData = {
      person: { identificationStatus: "unavailable", persons: [] },
      document: { documentType: "Invoice" },
    };
    const uncategorizedLibraries = await libraryService.syncDocumentToLibraries({
      userId: "user-1",
      documentId: "document-1",
      extractedData: documentData,
    });
    assert.equal(uncategorizedLibraries.length, 1);
    assert.equal(
      operations.find((operation) => operation[1]?.$setOnInsert)?.[1].$setOnInsert.name,
      "Uncategorized",
    );
    assert.equal(
      operations.find((operation) => operation[1]?.$push)?.[1].$push.documents.documentType,
      "Invoice",
    );
  } finally {
    Document.findOne = originalFind;
    DocumentLibrary.findOneAndUpdate = originalUpdate;
  }
});

test("processing the same document again replaces its library snapshot", async () => {
  const originalFind = Document.findOne;
  const originalLibraryUpdate = DocumentLibrary.findOneAndUpdate;
  const storedDocuments = [];
  let documentData = { document: { documentType: "Aadhaar" }, fields: { fullName: "A Person" } };
  Document.findOne = (filter) => ({
    select() {
      return this;
    },
    lean: async () => ({
      _id: filter._id,
      fileType: "application/pdf",
      fileSize: 2048,
      data: documentData,
    }),
  });
  DocumentLibrary.findOneAndUpdate = async (filter, update) => {
    if (update.$setOnInsert) return { _id: "library-1", name: update.$setOnInsert.name };

    if (update.$set) {
      const existingIndex = storedDocuments.findIndex(
        (entry) => entry.documentId === update.$set["documents.$"].documentId,
      );
      if (existingIndex >= 0) {
        storedDocuments[existingIndex] = update.$set["documents.$"];
        return { _id: filter._id, documents: [...storedDocuments] };
      }
      return null;
    }

    if (update.$push) {
      storedDocuments.push(update.$push.documents);
      return { _id: filter._id, documents: [...storedDocuments] };
    }
    return null;
  };

  try {
    const input = {
      userId: "user-1",
      documentId: "document-1",
      extractedData: {},
    };
    await libraryService.syncDocumentToLibraries(input);
    documentData = {
      document: { documentType: "Aadhaar" },
      fields: { fullName: "Updated Person", aadhaarNumber: "1234" },
    };
    await libraryService.syncDocumentToLibraries(input);

    assert.equal(storedDocuments.length, 1);
    assert.deepEqual(storedDocuments[0], {
      documentId: "document-1",
      fileType: "application/pdf",
      fileSize: 2048,
      documentType: "Aadhaar",
      data: documentData,
    });
  } finally {
    Document.findOne = originalFind;
    DocumentLibrary.findOneAndUpdate = originalLibraryUpdate;
  }
});

test("document library routes authenticate and scope operations to the JWT user", async () => {
  const server = app.listen(0);
  const userId = "507f1f77bcf86cd799439011";
  const token = jwt.sign({ id: userId }, config.jwtAccessSecret);
  const connectedUserId = "507f1f77bcf86cd799439099";
  const originalMethods = {
    findOrCreateDocumentLibrary: libraryService.findOrCreateDocumentLibrary,
    getUserLibraries: libraryService.getUserLibraries,
    getUserLibrary: libraryService.getUserLibrary,
    getLibraryDocuments: libraryService.getLibraryDocuments,
    attachDocument: libraryService.attachDocument,
    updateLibraryName: libraryService.updateLibraryName,
    deleteUserLibrary: libraryService.deleteUserLibrary,
  };
  const captured = [];
  const library = { _id: "507f1f77bcf86cd799439012", name: "Krishna Kumar Tudu" };
  libraryService.findOrCreateDocumentLibrary = async (input) => {
    captured.push(["resolve", input]);
    return library;
  };
  libraryService.getUserLibraries = async (user) => {
    captured.push(["list", user]);
    return [library];
  };
  libraryService.getUserLibrary = async (input) => {
    captured.push(["get", input]);
    return library;
  };
  libraryService.getLibraryDocuments = async (input) => {
    captured.push(["documents", input]);
    return { library, documents: [{ _id: "document-1" }] };
  };
  libraryService.attachDocument = async (input) => {
    captured.push(["attach", input]);
    return library;
  };
  libraryService.updateLibraryName = async (input) => {
    captured.push(["rename", input]);
    return library;
  };
  libraryService.deleteUserLibrary = async (input) => {
    captured.push(["delete", input]);
    return library;
  };

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}) => fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  try {
    const unauthenticated = await request("/api/document-library");
    assert.equal(unauthenticated.status, 401);

    const authHeaders = { authorization: `Bearer ${token}` };
    const resolved = await request("/api/document-library/resolve", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: " Krishna   Kumar Tudu " }),
    });
    assert.equal(resolved.status, 200);
    assert.deepEqual(captured[0], [
      "resolve",
      { userId, name: " Krishna   Kumar Tudu " },
    ]);

    const emptyName = await request("/api/document-library/resolve", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "   " }),
    });
    assert.equal(emptyName.status, 400);

    const list = await request("/api/document-library", { headers: authHeaders });
    assert.equal(list.status, 200);
    assert.deepEqual(captured[1], ["list", userId]);

    const libraryId = "507f1f77bcf86cd799439012";
    const oneLibrary = await request(`/api/document-library/${libraryId}`, {
      headers: authHeaders,
    });
    assert.equal(oneLibrary.status, 200);
    assert.deepEqual(captured[2], ["get", { libraryId, userId }]);

    const documents = await request(`/api/document-library/${libraryId}/documents`, {
      headers: authHeaders,
    });
    assert.equal(documents.status, 200);
    assert.deepEqual(captured[3], ["documents", { libraryId, userId }]);

    const attached = await request(`/api/document-library/${libraryId}/documents`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ documentId: "507f1f77bcf86cd799439013" }),
    });
    assert.equal(attached.status, 200);
    assert.deepEqual(captured[4], [
      "attach",
      { libraryId, documentId: "507f1f77bcf86cd799439013", userId },
    ]);

    const renamed = await request(`/api/document-library/${libraryId}`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ name: "Updated Person" }),
    });
    assert.equal(renamed.status, 200);
    assert.deepEqual(captured[5], [
      "rename",
      { libraryId, userId, name: "Updated Person" },
    ]);

    const removed = await request(`/api/document-library/${libraryId}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    assert.equal(removed.status, 200);
    assert.deepEqual(captured[6], ["delete", { libraryId, userId }]);

    const authServiceMock = mock.method(axios, "get", async () => ({
      data: {
        data: {
          connected: true,
          role: "viewer",
          user: { id: connectedUserId, userName: "connected" },
        },
      },
    }));
    try {
      const connectedLibraries = await request(
        `/api/document-library?ownerId=${connectedUserId}`,
        { headers: authHeaders },
      );
      assert.equal(connectedLibraries.status, 200);
      assert.deepEqual(captured[7], ["list", connectedUserId]);

      const connectedRename = await request(
        `/api/document-library/${libraryId}?ownerId=${connectedUserId}`,
        {
          method: "PATCH",
          headers: authHeaders,
          body: JSON.stringify({ name: "Connected Person" }),
        },
      );
      assert.equal(connectedRename.status, 200);
      assert.deepEqual(captured[8], [
        "rename",
        { libraryId, userId: connectedUserId, name: "Connected Person" },
      ]);

      const connectedAttach = await request(
        `/api/document-library/${libraryId}/documents?ownerId=${connectedUserId}`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ documentId: "507f1f77bcf86cd799439013" }),
        },
      );
      assert.equal(connectedAttach.status, 200);
      assert.deepEqual(captured[9], [
        "attach",
        {
          libraryId,
          documentId: "507f1f77bcf86cd799439013",
          userId: connectedUserId,
        },
      ]);

      const forbiddenDelete = await request(
        `/api/document-library/${libraryId}?ownerId=${connectedUserId}`,
        { method: "DELETE", headers: authHeaders },
      );
      assert.equal(forbiddenDelete.status, 403);
      assert.equal(captured.length, 10);
    } finally {
      authServiceMock.mock.restore();
    }

    const invalidId = await request("/api/document-library/not-an-id", {
      headers: authHeaders,
    });
    assert.equal(invalidId.status, 400);

    const malformedBody = await request("/api/document-library/resolve", {
      method: "POST",
      headers: authHeaders,
      body: "{invalid",
    });
    assert.equal(malformedBody.status, 400);
  } finally {
    Object.assign(libraryService, originalMethods);
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
