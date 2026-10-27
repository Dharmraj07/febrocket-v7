import test from "node:test";
import assert from "node:assert/strict";

import { configureStore } from "@reduxjs/toolkit";
import { api } from "../../lib/api.js";
import documentReducer, {
  getAllUserDocuments,
  getDocuments,
  getDocumentLibraries,
  getLibraryDocuments,
  uploadDocumentLocal,
  previewAdminDocument,
  previewDocument,
  downloadAdminDocument,
  downloadDocument,
  uploadDocument,
} from "./documentSlice.js";

test("getDocuments requests and stores one paginated page", async () => {
  const originalGet = api.get;
  const documents = [{ _id: "document-21" }];
  let request;
  api.get = async (...args) => {
    request = args;
    return {
      data: {
        documents,
        pagination: {
          page: 2,
          limit: 20,
          total: 21,
          totalPages: 2,
          hasNextPage: false,
          hasPrevPage: true,
        },
      },
    };
  };

  try {
    const store = configureStore({
      reducer: { documents: documentReducer },
    });

    await store.dispatch(getDocuments({ page: 2, limit: 20 })).unwrap();

    assert.equal(request[0], "/api/documents");
    assert.deepEqual(request[1].params, { page: 2, limit: 20 });
    assert.deepEqual(store.getState().documents.documents, documents);
    assert.equal(store.getState().documents.documentsPagination.page, 2);
    assert.equal(store.getState().documents.documentsPagination.total, 21);
  } finally {
    api.get = originalGet;
  }
});

test("aborting getDocuments does not store a cancellation error", async () => {
  const originalGet = api.get;
  api.get = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => {
          const error = new Error("canceled");
          error.name = "CanceledError";
          error.code = "ERR_CANCELED";
          reject(error);
        },
        { once: true }
      );
    });

  try {
    const store = configureStore({
      reducer: { documents: documentReducer },
    });
    const request = store.dispatch(getDocuments());
    request.abort();
    const action = await request;

    assert.equal(action.meta.aborted, true);
    assert.equal(store.getState().documents.error, null);
    assert.equal(store.getState().documents.isLoading, false);
  } finally {
    api.get = originalGet;
  }
});

test("getDocuments corrects a requested page that no longer exists", async () => {
  const originalGet = api.get;
  const pages = [];
  api.get = async (_url, config) => {
    const page = config.params.page;
    pages.push(page);
    return {
      data: {
        documents: page === 1 ? [{ _id: "document-1" }] : [],
        pagination: {
          page,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      },
    };
  };

  try {
    const store = configureStore({
      reducer: { documents: documentReducer },
    });

    await store.dispatch(getDocuments({ page: 2, limit: 20 })).unwrap();

    assert.deepEqual(pages, [2, 1]);
    assert.equal(store.getState().documents.documentsPagination.page, 1);
    assert.deepEqual(store.getState().documents.documents, [{ _id: "document-1" }]);
  } finally {
    api.get = originalGet;
  }
});

test("uploadDocument posts the selected document and stores its response without duplicates", async () => {
  const originalPost = api.post;
  const uploadedDocument = {
    _id: "document-1",
    fileName: "example.webp",
    fileType: "image/webp",
    fileSize: 110658,
    status: "queued",
    publicUrl: "https://example.r2.dev/example.webp",
    createdAt: "2026-09-29T04:41:07.498Z",
    processingError: null,
    processedAt: null,
  };
  const requests = [];
  api.post = async (...args) => {
    requests.push(args);
    return {
      data: {
        success: true,
        message: "Document uploaded successfully and queued for processing.",
        document: uploadedDocument,
      },
    };
  };

  try {
    const store = configureStore({
      reducer: { documents: documentReducer },
    });
    const file = new Blob(["document contents"], { type: "image/webp" });

    await store.dispatch(uploadDocument(file)).unwrap();
    await store.dispatch(uploadDocument(file)).unwrap();

    assert.equal(requests.length, 2);
    assert.equal(requests[0][0], "/api/documents/upload");
    assert.equal(requests[0][1] instanceof FormData, true);
    assert.equal(requests[0][1].has("document"), true);
    assert.equal(
      requests[0][1].get("document").type,
      "image/webp"
    );
    assert.equal(requests[0][2].withCredentials, true);
    assert.deepEqual(requests[0][2].headers, {
      "Content-Type": "multipart/form-data",
    });
    assert.equal(requests[0][2].timeout, 120000);
    assert.equal(typeof requests[0][2].signal.addEventListener, "function");
    assert.deepEqual(store.getState().documents.documents, [
      uploadedDocument,
    ]);
    assert.equal(store.getState().documents.uploading, false);
    assert.equal(
      store.getState().documents.message,
      "Document uploaded successfully and queued for processing."
    );
  } finally {
    api.post = originalPost;
  }
});

test("uploadDocument reports real upload progress when a callback is provided", async () => {
  const originalPost = api.post;
  const uploadedDocument = {
    _id: "document-progress",
    fileName: "statement.pdf",
  };
  const progressUpdates = [];

  api.post = async (_url, _formData, config) => {
    config.onUploadProgress({ loaded: 25, total: 100 });
    return {
      data: {
        success: true,
        document: uploadedDocument,
      },
    };
  };

  try {
    const store = configureStore({
      reducer: { documents: documentReducer },
    });
    const file = new Blob(["document contents"], { type: "application/pdf" });

    await store.dispatch(
      uploadDocument({
        file,
        onProgress: (progress) => progressUpdates.push(progress),
      })
    ).unwrap();

    assert.deepEqual(progressUpdates, [
      { loaded: 25, total: 100, percent: 25 },
    ]);
    assert.deepEqual(store.getState().documents.documents, [uploadedDocument]);
  } finally {
    api.post = originalPost;
  }
});

test("uploadDocumentLocal sends the file as multipart form data", async () => {
  const originalPost = api.post;
  let request;
  api.post = async (...args) => {
    request = args;
    return {
      data: {
        success: true,
        file: { originalName: "local.pdf" },
      },
    };
  };

  try {
    const store = configureStore({
      reducer: { documents: documentReducer },
    });
    const file = new Blob(["document contents"], { type: "application/pdf" });
    await store.dispatch(uploadDocumentLocal(file)).unwrap();

    assert.equal(request[0], "/api/documents/upload/local");
    assert.equal(request[1] instanceof FormData, true);
    assert.equal(request[1].get("document").type, "application/pdf");
    assert.equal(request[2].withCredentials, true);
    assert.deepEqual(request[2].headers, {
      "Content-Type": "multipart/form-data",
    });
  } finally {
    api.post = originalPost;
  }
});

test("getAllUserDocuments fetches and combines every page from the existing documents API", async () => {
  const originalGet = api.get;
  const requests = [];
  api.get = async (url, config) => {
    requests.push({ url, config });
    const page = config.params.page;
    return {
      data: {
        documents: [{ _id: `document-${page}` }],
        pagination: {
          page,
          limit: 100,
          total: 201,
          totalPages: 3,
        },
      },
    };
  };

  try {
    const store = configureStore({
      reducer: { documents: documentReducer },
    });

    await store.dispatch(getAllUserDocuments()).unwrap();

    assert.deepEqual(
      requests.map(({ url, config }) => [url, config.params.page, config.params.limit]),
      [
        ["/api/documents", 1, 100],
        ["/api/documents", 2, 100],
        ["/api/documents", 3, 100],
      ]
    );
    assert.deepEqual(
      store.getState().documents.documents.map(({ _id }) => _id),
      ["document-1", "document-2", "document-3"]
    );
    assert.equal(store.getState().documents.documentsPagination.total, 201);
  } finally {
    api.get = originalGet;
  }
});

test("document library thunks use the existing list and person-document APIs", async () => {
  const originalGet = api.get;
  const library = {
    _id: "library-1",
    name: "Dharm Raj Hembram",
    documents: ["document-1"],
  };
  const requests = [];
  api.get = async (url, config) => {
    requests.push({ url, config });
    return url === "/api/document-library"
      ? { data: { success: true, libraries: [library] } }
      : {
          data: {
            success: true,
            library,
            documents: [{ _id: "document-1", data: { documentType: "Identity Card" } }],
          },
        };
  };

  try {
    const store = configureStore({
      reducer: { documents: documentReducer },
    });

    await store.dispatch(getDocumentLibraries()).unwrap();
    await store.dispatch(getLibraryDocuments(library._id)).unwrap();

    assert.deepEqual(
      requests.map(({ url }) => url),
      [
        "/api/document-library",
        "/api/document-library/library-1/documents",
      ]
    );
    assert.equal(
      requests.every(({ config }) => typeof config.signal?.addEventListener === "function"),
      true
    );
    assert.deepEqual(store.getState().documents.documentLibraries, [library]);
    assert.deepEqual(store.getState().documents.libraryDocuments, [
      { _id: "document-1", data: { documentType: "Identity Card" } },
    ]);
    assert.equal(store.getState().documents.selectedLibrary._id, library._id);
  } finally {
    api.get = originalGet;
  }
});

test("document preview and download thunks return serializable object URLs", async () => {
  const originalGet = api.get;
  const originalConsoleError = console.error;
  const requests = [];
  const warnings = [];
  api.get = async (url, config) => {
    requests.push({ url, config });
    return { data: new Blob(["document contents"], { type: "application/pdf" }) };
  };
  console.error = (...args) => warnings.push(args);

  try {
    const store = configureStore({
      reducer: { documents: documentReducer },
    });
    const previewUrl = await store.dispatch(previewDocument("user-document")).unwrap();
    const downloadUrl = await store.dispatch(downloadDocument("user-document")).unwrap();
    const adminPreviewUrl = await store.dispatch(previewAdminDocument("admin-document")).unwrap();
    const adminDownloadUrl = await store.dispatch(downloadAdminDocument("admin-document")).unwrap();

    assert.deepEqual(
      requests.map(({ url }) => url),
      [
        "/api/documents/user-document/preview",
        "/api/documents/user-document/download",
        "/api/documents/admin/admin-document/preview",
        "/api/documents/admin/admin-document/download",
      ]
    );
    assert.ok([previewUrl, downloadUrl, adminPreviewUrl, adminDownloadUrl].every(
      (url) => typeof url === "string" && url.startsWith("blob:")
    ));
    assert.equal(store.getState().documents.previewUrl, null);
    assert.equal(store.getState().documents.downloadUrl, null);
    assert.deepEqual(warnings, []);
    [previewUrl, downloadUrl, adminPreviewUrl, adminDownloadUrl].forEach((url) =>
      URL.revokeObjectURL(url)
    );
  } finally {
    api.get = originalGet;
    console.error = originalConsoleError;
  }
});
