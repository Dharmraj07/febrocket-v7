import test from "node:test";
import assert from "node:assert/strict";

import { configureStore } from "@reduxjs/toolkit";
import { api } from "../../lib/api.js";
import documentReducer, {
  getAdminDocumentById,
  getDocumentById,
  getDocuments,
  retryDocumentProcessing,
  updateDocumentExtractedData,
} from "../document/documentSlice.js";

function createStore() {
  return configureStore({ reducer: { documents: documentReducer } });
}

function restoreApi(methods) {
  Object.assign(api, methods);
}

test("document reads use unified document API response envelopes", async () => {
  const original = { get: api.get };
  const requests = [];
  const document = {
    _id: "document-1",
    status: "processing",
    data: { fullName: "Ada Lovelace" },
  };
  api.get = async (url, config = {}) => {
    requests.push({ url, config });
    if (url === "/api/documents") {
      return {
        data: {
          success: true,
          documents: [document],
          pagination: { page: 1, limit: 20, pages: 2 },
        },
      };
    }
    return { data: { success: true, document } };
  };

  try {
    const store = createStore();
    await store.dispatch(getDocuments()).unwrap();
    await store.dispatch(getDocumentById("document-1")).unwrap();
    await store.dispatch(getAdminDocumentById("document-1")).unwrap();

    assert.deepEqual(requests.map(({ url }) => url), [
      "/api/documents",
      "/api/documents/document-1",
      "/api/documents/admin/document-1",
    ]);
    assert.equal(store.getState().documents.documents[0].data.fullName, "Ada Lovelace");
    assert.equal(store.getState().documents.documentsPagination.totalPages, 2);
    assert.equal(store.getState().documents.selectedDocument.status, "processing");
    assert.equal(store.getState().documents.adminSelectedDocument.data.fullName, "Ada Lovelace");
  } finally {
    restoreApi(original);
  }
});

test("retry sends a single request and updates the document from the backend response", async () => {
  const original = { post: api.post };
  const requests = [];
  let completeRequest;
  const responseDocument = { _id: "document-2", status: "queued", data: {} };
  api.post = (url, body, config) => {
    requests.push({ url, body, config });
    return new Promise((resolve) => {
      completeRequest = () => resolve({ data: { success: true, document: responseDocument } });
    });
  };

  try {
    const store = createStore();
    store.dispatch(getDocuments.pending("seed-list-request", {
      page: 1,
      limit: 20,
    }));
    store.dispatch({
      type: "documents/getDocuments/fulfilled",
      payload: { documents: [{ _id: "document-2", status: "failed" }] },
      meta: { requestId: "seed-list-request" },
    });
    const first = store.dispatch(retryDocumentProcessing({ documentId: "document-2" }));
    const duplicate = await store.dispatch(
      retryDocumentProcessing({ documentId: "document-2" })
    );
    assert.equal(requests.length, 1);
    assert.equal(duplicate.meta.condition, true);

    completeRequest();
    await first.unwrap();
    assert.equal(requests[0].url, "/api/documents/document-2/retry");
    assert.equal(requests[0].config.withCredentials, true);
    assert.equal(store.getState().documents.documents[0].status, "queued");
    assert.deepEqual(store.getState().documents.processingDocumentIds, []);
  } finally {
    restoreApi(original);
  }
});

test("extracted information updates through the document API", async () => {
  const original = { put: api.put };
  const requests = [];
  const updated = {
    _id: "document-3",
    status: "processed",
    data: { identity: { name: "Ada", birthYear: 1815 } },
  };
  api.put = async (url, body, config) => {
    requests.push({ url, body, config });
    return { data: { success: true, document: updated } };
  };

  try {
    const store = createStore();
    await store.dispatch(
      updateDocumentExtractedData({
        documentId: "document-3",
        data: updated.data,
      })
    ).unwrap();

    assert.equal(requests[0].url, "/api/documents/document-3/data");
    assert.deepEqual(requests[0].body, { data: updated.data });
    assert.equal(store.getState().documents.selectedDocument.data.identity.name, "Ada");
  } finally {
    restoreApi(original);
  }
});

test("document errors are mapped to safe user-facing messages", async () => {
  const original = { get: api.get };
  api.get = async () => {
    const error = new Error("MongoServerError: internal database trace");
    error.response = { status: 409, data: { message: error.message } };
    throw error;
  };

  try {
    const store = createStore();
    store.dispatch({
      type: "documents/getDocumentById/pending",
      meta: { requestId: "seed-request" },
    });
    store.dispatch({
      type: "documents/getDocumentById/fulfilled",
      payload: { _id: "document-4", fileName: "stale-document.pdf" },
      meta: { requestId: "seed-request" },
    });
    const result = await store.dispatch(getDocumentById("document-4"));
    assert.equal(result.meta.rejectedWithValue, true);
    assert.deepEqual(result.payload, {
      message: "This document is already being processed.",
      status: 409,
    });
    assert.equal(store.getState().documents.selectedDocument, null);
  } finally {
    restoreApi(original);
  }
});

test("late document responses cannot replace the latest selected document", async () => {
  const original = { get: api.get };
  const pending = [];
  api.get = (url) =>
    new Promise((resolve) => pending.push({ url, resolve }));

  try {
    const store = createStore();
    const first = store.dispatch(getDocumentById("document-old"));
    const latest = store.dispatch(getDocumentById("document-latest"));

    pending[1].resolve({
      data: { document: { _id: "document-latest", status: "processed" } },
    });
    await latest.unwrap();
    pending[0].resolve({
      data: { document: { _id: "document-old", status: "failed" } },
    });
    await first.unwrap();

    assert.equal(
      store.getState().documents.selectedDocument._id,
      "document-latest"
    );
  } finally {
    restoreApi(original);
  }
});
