
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { api } from "../../lib/api.js";

/*
|--------------------------------------------------------------------------
| Initial State
|--------------------------------------------------------------------------
*/

const initialState = {
  // ============================================================
  // USER DOCUMENTS
  // ============================================================

  documents: [],
  documentsRequestId: null,
  selectedDocument: null,
  selectedDocumentLoading: false,
  selectedDocumentRequestId: null,

  documentsPagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  },
  documentLibrariesRequestId: null,
  documentLibraries: [],
  documentLibrariesLoading: false,
  libraryDocuments: [],
  selectedLibrary: null,
  libraryDocumentsLoading: false,
  libraryDocumentsRequestId: null,
  libraryError: null,

  // ============================================================
  // ADMIN DOCUMENTS
  // ============================================================

  adminDocuments: [],
  adminDocumentsRequestId: null,
  adminSelectedDocument: null,
  adminDocumentsLoading: false,
  adminDocumentLoading: false,
  adminDocumentRequestId: null,

  adminDocumentsPagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  },

  adminStats: null,
  adminStatsLoading: false,

  // ============================================================
  // FILE OPERATIONS
  // ============================================================

  uploading: false,
  adminUploading: false,
  processingDocumentIds: [],

  previewLoading: false,
  previewRequestId: null,
  downloadLoading: false,
  downloadRequestId: null,

  previewUrl: null,
  downloadUrl: null,

  // ============================================================
  // GLOBAL
  // ============================================================

  isLoading: false,
  error: null,
  message: null,
};

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function getErrorPayload(
  error,
  fallbackMessage = "Something went wrong."
) {
  const status = error?.response?.status ?? null;
  const messages = {
    400: "Invalid request.",
    401: "Authentication required. Please sign in again.",
    403: "Access denied.",
    404: "Document not found.",
    409: "This document is already being processed.",
    413: "This file is too large. Choose a file smaller than 10 MB.",
    415: "This file type is not supported.",
    422: "The file or document data is invalid.",
    429: "Too many requests. Please wait and try again.",
    500: "The server could not complete the request.",
    502: "The document service is temporarily unavailable.",
    503: "The document service is temporarily unavailable.",
  };
  const isTimeout = ["ECONNABORTED", "ETIMEDOUT"].includes(error?.code);

  return {
    message: status
      ? messages[status] || fallbackMessage
      : isTimeout
        ? "The request took too long. Please try again."
        : error?.code === "ERR_CANCELED"
          ? "The request was cancelled."
          : error?.request
            ? "Connection problem. Check your network and try again."
            : fallbackMessage,
    status,
  };
}

function getPagination(pagination) {
  return {
    page: pagination?.page || 1,
    limit: pagination?.limit || 20,
    total: pagination?.total || 0,
    totalPages: pagination?.totalPages ?? pagination?.pages ?? 0,
    hasNextPage: Boolean(pagination?.hasNextPage),
    hasPrevPage: Boolean(pagination?.hasPrevPage),
  };
}

function getMessage(response, fallback = null) {
  return response?.data?.message || fallback;
}

/*
|--------------------------------------------------------------------------
| USER DOCUMENTS
|--------------------------------------------------------------------------
*/

/*
 * POST /api/documents/upload
 *
 * Upload document to Cloudflare R2.
 *
 * Form field:
 * document
 */

export const uploadDocument = createAsyncThunk(
  "documents/uploadDocument",

  async (fileInput, { rejectWithValue, signal }) => {
    try {
      const config =
        fileInput && typeof fileInput === "object" && !(fileInput instanceof Blob) && !(fileInput instanceof File)
          ? fileInput
          : { file: fileInput };

      const file = config.file ?? fileInput;
      const formData = new FormData();

      formData.append("document", file);

      const axiosConfig = {
        withCredentials: true,
        timeout: 120000,
        signal,
        headers: {
          "Content-Type": "multipart/form-data",
        },
      };

      if (typeof config.onProgress === "function") {
        axiosConfig.onUploadProgress = (event) => {
          if (event?.total) {
            const percent = Math.round((event.loaded / event.total) * 100);
            config.onProgress({
              loaded: event.loaded,
              total: event.total,
              percent,
            });
          }
        };
      }

      const response = await api.post(
        "/api/documents/upload",
        formData,
        axiosConfig
      );

      const document = response.data?.document;
      if (!document?._id) {
        throw new Error("Upload response did not include a document.");
      }

      return {
        document,
        message: getMessage(
          response,
          "Document uploaded successfully."
        ),
      };
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Failed to upload document."
        )
      );
    }
  }
);

/*
 * POST /api/documents/upload/local
 *
 * Upload document to local disk.
 */

export const uploadDocumentLocal = createAsyncThunk(
  "documents/uploadDocumentLocal",

  async (file, { rejectWithValue }) => {
    try {
      const formData = new FormData();

      formData.append("document", file);

      const response = await api.post(
        "/api/documents/upload/local",
        formData,
        {
          withCredentials: true,
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      return {
        file: response.data?.file || null,
        message: getMessage(
          response,
          "Document uploaded to local storage successfully."
        ),
      };
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Failed to upload document locally."
        )
      );
    }
  }
);

/*
 * GET /api/documents
 */

export const getDocuments = createAsyncThunk(
  "documents/getDocuments",

  async (
    {
      page = 1,
      limit = 20,
      ownerId,
    } = {},
    { rejectWithValue, signal }
  ) => {
    try {
      let requestedPage = Number(page) || 1;
      const requestParams = {
        page: requestedPage,
        limit,
      };
      if (ownerId) requestParams.ownerId = ownerId;

      let response = await api.get(
        "/api/documents",
        {
          params: requestParams,
          withCredentials: true,
          signal,
        }
      );

      const totalPages = Number(
        response.data?.pagination?.totalPages ??
          response.data?.pagination?.pages ??
          0
      );
      const lastPage = Math.max(1, totalPages);
      if (requestedPage > lastPage) {
        requestedPage = lastPage;
        const retryParams = {
          page: requestedPage,
          limit,
        };
        if (ownerId) retryParams.ownerId = ownerId;
        response = await api.get("/api/documents", {
          params: retryParams,
          withCredentials: true,
          signal,
        });
      }

      return response.data;
    } catch (error) {
      if (signal.aborted) throw error;
      return rejectWithValue(
        getErrorPayload(
          error,
          "Failed to fetch documents."
        )
      );
    }
  }
);

export const getAllUserDocuments = createAsyncThunk(
  "documents/getAllUserDocuments",
  async (_, { rejectWithValue, signal }) => {
    try {
      const firstPageResponse = await api.get("/api/documents", {
        params: { page: 1, limit: 100 },
        withCredentials: true,
        signal,
      });
      const firstPage = firstPageResponse.data || {};
      const pagination = firstPage.pagination || {};
      const totalPages = Math.max(
        1,
        Number(pagination.totalPages || pagination.pages || 1)
      );
      const remainingDocuments = [];
      for (let firstPage = 2; firstPage <= totalPages; firstPage += 5) {
        const pageCount = Math.min(5, totalPages - firstPage + 1);
        const pageResponses = await Promise.all(
          Array.from({ length: pageCount }, (_, index) =>
            api.get("/api/documents", {
              params: { page: firstPage + index, limit: 100 },
              withCredentials: true,
              signal,
            })
          )
        );
        remainingDocuments.push(
          ...pageResponses.flatMap((response) => response.data?.documents || [])
        );
      }

      return {
        ...firstPage,
        documents: [
          ...(firstPage.documents || []),
          ...remainingDocuments,
        ],
        pagination: {
          ...pagination,
          page: 1,
          limit: 100,
          totalPages,
          pages: totalPages,
        },
      };
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(error, "Failed to fetch documents.")
      );
    }
  }
);

export const getDocumentLibraries = createAsyncThunk(
  "documents/getDocumentLibraries",
  async (ownerId, { rejectWithValue, signal }) => {
    try {
      const response = await api.get("/api/document-library", {
        params: { ownerId },
        withCredentials: true,
        signal,
      });
      return response.data?.libraries || [];
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(error, "Failed to fetch document libraries.")
      );
    }
  }
);

export const getLibraryDocuments = createAsyncThunk(
  "documents/getLibraryDocuments",
  async (argument, { rejectWithValue, signal }) => {
    const { libraryId, ownerId } = typeof argument === "string"
      ? { libraryId: argument, ownerId: undefined }
      : argument;
    try {
      const response = await api.get(
        `/api/document-library/${libraryId}/documents`,
        { params: { ownerId }, withCredentials: true, signal }
      );
      return {
        library: response.data?.library || null,
        documents: response.data?.documents || [],
      };
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(error, "Failed to fetch library documents.")
      );
    }
  }
);

/*
 * GET /api/documents/:id
 */

export const getDocumentById = createAsyncThunk(
  "documents/getDocumentById",

  async (argument, { rejectWithValue, signal }) => {
    const { documentId, ownerId } = typeof argument === "string"
      ? { documentId: argument, ownerId: undefined }
      : argument;
    try {
      const response = await api.get(
        `/api/documents/${documentId}`,
        {
          params: { ownerId },
          withCredentials: true,
          signal,
        }
      );

      return response.data?.document || null;
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Failed to fetch document."
        )
      );
    }
  }
);

/*
 * GET /api/documents/:id/preview
 */

export const previewDocument = createAsyncThunk(
  "documents/previewDocument",

  async (argument, { rejectWithValue, signal }) => {
    const { documentId, ownerId } = typeof argument === "string"
      ? { documentId: argument, ownerId: undefined }
      : argument;
    try {
      const response = await api.get(
        `/api/documents/${documentId}/preview`,
        {
          params: { ownerId },
          responseType: "blob",
          withCredentials: true,
          signal,
        }
      );

      return URL.createObjectURL(response.data);
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Failed to preview document."
        )
      );
    }
  }
);

/*
 * GET /api/documents/:id/download
 */

export const downloadDocument = createAsyncThunk(
  "documents/downloadDocument",

  async (argument, { rejectWithValue, signal }) => {
    const { documentId, ownerId } = typeof argument === "string"
      ? { documentId: argument, ownerId: undefined }
      : argument;
    try {
      const response = await api.get(
        `/api/documents/${documentId}/download`,
        {
          params: { ownerId },
          responseType: "blob",
          withCredentials: true,
          signal,
        }
      );

      return URL.createObjectURL(response.data);
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Failed to download document."
        )
      );
    }
  }
);

/*
 * DELETE /api/documents/:id
 */

export const deleteDocument = createAsyncThunk(
  "documents/deleteDocument",

  async (documentId, { rejectWithValue }) => {
    try {
      const response = await api.delete(
        `/api/documents/${documentId}`,
        {
          withCredentials: true,
        }
      );

      return {
        documentId,
        message: getMessage(
          response,
          "Document deleted successfully."
        ),
      };
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Failed to delete document."
        )
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| ADMIN DOCUMENTS
|--------------------------------------------------------------------------
*/

/*
 * POST /api/documents/admin/:id/upload
 *
 * Admin uploads a document on behalf of the target ID.
 *
 * Form field:
 * document
 */

export const adminUploadDocument = createAsyncThunk(
  "documents/adminUploadDocument",

  async (
    {
      id,
      file,
      onProgress,
    },
    { rejectWithValue, signal }
  ) => {
    try {
      if (!id) {
        return rejectWithValue({
          message: "Target ID is required.",
          status: 400,
        });
      }

      if (!file) {
        return rejectWithValue({
          message: "Document file is required.",
          status: 400,
        });
      }

      const formData = new FormData();

      formData.append("document", file);

      const response = await api.post(
        `/api/documents/admin/${id}/upload`,
        formData,
        {
          withCredentials: true,
          headers: {
            "Content-Type": "multipart/form-data",
          },
          timeout: 120000,
          signal,
          onUploadProgress: (event) => {
            if (event.total && typeof onProgress === "function") {
              onProgress({
                loaded: event.loaded,
                total: event.total,
                percent: Math.round((event.loaded / event.total) * 100),
              });
            }
          },
        }
      );

      return {
        id,
        document:
          response.data?.document || null,

        message: getMessage(
          response,
          "Document uploaded successfully by admin."
        ),
      };
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Admin document upload failed."
        )
      );
    }
  }
);

/*
 * GET /api/documents/admin/stats
 */

export const getDocumentStats = createAsyncThunk(
  "documents/getDocumentStats",

  async (_, { rejectWithValue, signal }) => {
    try {
      const response = await api.get(
        "/api/documents/admin/stats",
        {
          withCredentials: true,
          signal,
        }
      );

      return response.data?.stats || null;
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Failed to fetch document statistics."
        )
      );
    }
  }
);

/*
 * GET /api/documents/admin/all
 *
 * Query:
 * page
 * limit
 * userId
 * status
 * fileType
 * q
 * from
 * to
 */

export const getAllDocumentsAdmin = createAsyncThunk(
  "documents/getAllDocumentsAdmin",

  async (
    {
      page = 1,
      limit = 20,
      userId,
      status,
      fileType,
      q,
      from,
      to,
    } = {},
    { rejectWithValue, signal }
  ) => {
    try {
      const response = await api.get(
        "/api/documents/admin/all",
        {
          params: {
            page,
            limit,
            userId,
            status,
            fileType,
            q,
            from,
            to,
          },

          withCredentials: true,
          signal,
        }
      );

      return response.data;
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Failed to fetch admin documents."
        )
      );
    }
  }
);

/*
 * GET /api/documents/admin/:id
 */

export const getAdminDocumentById = createAsyncThunk(
  "documents/getAdminDocumentById",

  async (documentId, { rejectWithValue, signal }) => {
    try {
      const response = await api.get(
        `/api/documents/admin/${documentId}`,
        {
          withCredentials: true,
          signal,
        }
      );

      return response.data?.document || null;
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Failed to fetch admin document."
        )
      );
    }
  }
);

/*
 * GET /api/documents/admin/:id/preview
 */

export const previewAdminDocument = createAsyncThunk(
  "documents/previewAdminDocument",

  async (documentId, { rejectWithValue, signal }) => {
    try {
      const response = await api.get(
        `/api/documents/admin/${documentId}/preview`,
        {
          responseType: "blob",
          withCredentials: true,
          signal,
        }
      );

      return URL.createObjectURL(response.data);
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Failed to preview admin document."
        )
      );
    }
  }
);

/*
 * GET /api/documents/admin/:id/download
 */

export const downloadAdminDocument = createAsyncThunk(
  "documents/downloadAdminDocument",

  async (documentId, { rejectWithValue, signal }) => {
    try {
      const response = await api.get(
        `/api/documents/admin/${documentId}/download`,
        {
          responseType: "blob",
          withCredentials: true,
          signal,
        }
      );

      return URL.createObjectURL(response.data);
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Failed to download admin document."
        )
      );
    }
  }
);

/*
 * DELETE /api/documents/admin/:id
 */

export const deleteAdminDocument = createAsyncThunk(
  "documents/deleteAdminDocument",

  async (documentId, { rejectWithValue }) => {
    try {
      const response = await api.delete(
        `/api/documents/admin/${documentId}`,
        {
          withCredentials: true,
        }
      );

      return {
        documentId,

        message: getMessage(
          response,
          "Document deleted successfully."
        ),
      };
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Failed to delete admin document."
        )
      );
    }
  }
);

export const retryDocumentProcessing = createAsyncThunk(
  "documents/retryDocumentProcessing",
  async ({ documentId, ownerId, admin = false }, { rejectWithValue }) => {
    try {
      const path = admin
        ? `/api/documents/admin/${documentId}/retry`
        : `/api/documents/${documentId}/retry`;
      const response = await api.post(
        path,
        {},
        { params: { ownerId }, withCredentials: true },
      );
      return response.data?.document || null;
    } catch (error) {
      return rejectWithValue(getErrorPayload(error, "Could not retry document processing."));
    }
  },
  {
    condition: ({ documentId }, { getState }) =>
      !getState().documents.processingDocumentIds.includes(String(documentId)),
  }
);

export const updateDocumentExtractedData = createAsyncThunk(
  "documents/updateDocumentExtractedData",
  async ({ documentId, data, ownerId, admin = false }, { rejectWithValue }) => {
    try {
      const path = admin
        ? `/api/documents/admin/${documentId}/data`
        : `/api/documents/${documentId}/data`;
      const response = await api.put(
        path,
        { data },
        { params: { ownerId }, withCredentials: true },
      );
      return response.data?.document || null;
    } catch (error) {
      return rejectWithValue(getErrorPayload(error, "Could not save extracted information."));
    }
  }
);

/*
|--------------------------------------------------------------------------
| Slice
|--------------------------------------------------------------------------
*/

const documentSlice = createSlice({
  name: "documents",

  initialState,

  reducers: {
    clearDocumentError: (state) => {
      state.error = null;
    },

    clearDocumentMessage: (state) => {
      state.message = null;
    },

    clearSelectedDocument: (state) => {
      state.selectedDocument = null;
      state.selectedDocumentLoading = false;
      state.selectedDocumentRequestId = null;
    },

    clearAdminSelectedDocument: (state) => {
      state.adminSelectedDocument = null;
      state.adminDocumentLoading = false;
      state.adminDocumentRequestId = null;
    },

    setAdminSelectedDocument: (state, action) => {
      state.adminSelectedDocument = action.payload;
      state.adminDocumentLoading = false;
      state.adminDocumentRequestId = null;
    },

    clearPreviewBlob: (state) => {
      state.previewUrl = null;
    },

    clearDownloadBlob: (state) => {
      state.downloadUrl = null;
    },

    clearDocuments: (state) => {
      state.documents = [];
      state.documentsRequestId = null;
      state.selectedDocument = null;
      state.selectedDocumentLoading = false;
      state.selectedDocumentRequestId = null;
    },

    clearWorkspaceDocuments: (state) => {
      state.documents = [];
      state.documentsRequestId = null;
      state.selectedDocument = null;
      state.selectedDocumentLoading = false;
      state.selectedDocumentRequestId = null;
      state.documentsPagination = initialState.documentsPagination;
      state.documentLibrariesRequestId = null;
      state.documentLibraries = [];
      state.documentLibrariesLoading = false;
      state.libraryDocuments = [];
      state.selectedLibrary = null;
      state.libraryDocumentsLoading = false;
      state.libraryDocumentsRequestId = null;
      state.libraryError = null;
      state.isLoading = false;
      state.error = null;
      state.message = null;
    },

    clearAdminDocuments: (state) => {
      state.adminDocuments = [];
      state.adminDocumentsRequestId = null;
      state.adminSelectedDocument = null;
      state.adminDocumentLoading = false;
      state.adminDocumentRequestId = null;
    },

    resetDocumentState: () => initialState,
  },

  extraReducers: (builder) => {
    builder

      // ========================================================
      // USER UPLOAD
      // ========================================================

      .addCase(uploadDocument.pending, (state) => {
        state.uploading = true;
        state.error = null;
        state.message = null;
      })

      .addCase(uploadDocument.fulfilled, (state, action) => {
        state.uploading = false;
        state.error = null;
        state.message = action.payload.message;

        if (action.payload.document) {
          state.documents = [
            action.payload.document,
            ...state.documents.filter(
              (document) =>
                document._id !== action.payload.document._id
            ),
          ];
        }
      })

      .addCase(uploadDocument.rejected, (state, action) => {
        state.uploading = false;

        state.error = action.meta.aborted
          ? null
          : action.payload || {
              message: action.error.message || "Failed to upload document.",
            };
      })

      // ========================================================
      // LOCAL UPLOAD
      // ========================================================

      .addCase(uploadDocumentLocal.pending, (state) => {
        state.uploading = true;
        state.error = null;
      })

      .addCase(
        uploadDocumentLocal.fulfilled,
        (state, action) => {
          state.uploading = false;
          state.error = null;
          state.message = action.payload.message;
        }
      )

      .addCase(
        uploadDocumentLocal.rejected,
        (state, action) => {
          state.uploading = false;

          state.error = action.payload || {
            message: action.error.message || "Failed to upload document locally.",
          };
        }
      )

      // ========================================================
      // GET USER DOCUMENTS
      // ========================================================

      .addCase(getDocuments.pending, (state, action) => {
        state.documentsRequestId = action.meta.requestId;
        state.isLoading = true;
        state.error = null;
      })

      .addCase(getDocuments.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.documentsRequestId) return;
        state.documentsRequestId = null;
        state.isLoading = false;
        state.error = null;

        state.documents =
          action.payload?.documents || [];

        state.documentsPagination =
          getPagination(
            action.payload?.pagination
          );
      })

      .addCase(getDocuments.rejected, (state, action) => {
        if (action.meta.requestId !== state.documentsRequestId) return;
        state.documentsRequestId = null;
        state.isLoading = false;

        state.error = action.meta.aborted
          ? null
          : action.payload || {
              message: action.error.message || "Failed to fetch documents.",
            };
      })

      .addCase(getAllUserDocuments.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })

      .addCase(getAllUserDocuments.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = null;
        state.documents = action.payload?.documents || [];
        state.documentsPagination = getPagination(action.payload?.pagination);
      })

      .addCase(getAllUserDocuments.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.meta.aborted
          ? null
          : action.payload || {
              message: action.error.message || "Failed to fetch documents.",
            };
      })

      .addCase(getDocumentLibraries.pending, (state, action) => {
        state.documentLibrariesRequestId = action.meta.requestId;
        state.documentLibrariesLoading = true;
        state.libraryError = null;
      })

      .addCase(getDocumentLibraries.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.documentLibrariesRequestId) return;
        state.documentLibrariesRequestId = null;
        state.documentLibrariesLoading = false;
        state.documentLibraries = action.payload;
        state.libraryError = null;
      })

      .addCase(getDocumentLibraries.rejected, (state, action) => {
        if (action.meta.requestId !== state.documentLibrariesRequestId) return;
        state.documentLibrariesRequestId = null;
        state.documentLibrariesLoading = false;
        state.libraryError = action.meta.aborted
          ? null
          : action.payload || {
              message: action.error.message || "Failed to fetch document libraries.",
            };
      })

      .addCase(getLibraryDocuments.pending, (state, action) => {
        state.libraryDocumentsRequestId = action.meta.requestId;
        state.selectedLibrary = null;
        state.libraryDocuments = [];
        state.libraryDocumentsLoading = true;
        state.libraryError = null;
      })

      .addCase(getLibraryDocuments.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.libraryDocumentsRequestId) return;
        state.libraryDocumentsRequestId = null;
        state.selectedLibrary = action.payload.library;
        state.libraryDocuments = action.payload.documents;
        state.libraryDocumentsLoading = false;
        state.libraryError = null;
      })

      .addCase(getLibraryDocuments.rejected, (state, action) => {
        if (action.meta.requestId !== state.libraryDocumentsRequestId) return;
        state.libraryDocumentsRequestId = null;
        state.libraryDocumentsLoading = false;
        state.libraryError = action.meta.aborted
          ? null
          : action.payload || {
              message: action.error.message || "Failed to fetch library documents.",
            };
      })

      // ========================================================
      // GET USER DOCUMENT
      // ========================================================

      .addCase(getDocumentById.pending, (state, action) => {
        state.selectedDocumentRequestId = action.meta.requestId;
        state.selectedDocumentLoading = true;
        state.error = null;
      })

      .addCase(
        getDocumentById.fulfilled,
        (state, action) => {
          if (action.meta.requestId !== state.selectedDocumentRequestId) return;
          state.selectedDocumentLoading = false;
          state.selectedDocumentRequestId = null;
          state.selectedDocument =
            action.payload;
          state.error = null;
        }
      )

      .addCase(
        getDocumentById.rejected,
        (state, action) => {
          if (action.meta.requestId !== state.selectedDocumentRequestId) return;
          state.selectedDocumentLoading = false;
          state.selectedDocumentRequestId = null;
          state.selectedDocument = null;
          state.error = action.meta.aborted
            ? null
            : action.payload || {
                message: action.error.message || "Failed to fetch document.",
              };
        }
      )

      // ========================================================
      // PREVIEW USER DOCUMENT
      // ========================================================

      .addCase(
        previewDocument.pending,
        (state, action) => {
          state.previewRequestId = action.meta.requestId;
          state.previewLoading = true;
          state.previewUrl = null;
          state.error = null;
        }
      )

      .addCase(
        previewDocument.fulfilled,
        (state, action) => {
          if (action.meta.requestId !== state.previewRequestId) return;
          state.previewRequestId = null;
          state.previewLoading = false;
          state.previewUrl = null;
          state.error = null;
        }
      )

      .addCase(
        previewDocument.rejected,
        (state, action) => {
          if (action.meta.requestId !== state.previewRequestId) return;
          state.previewRequestId = null;
          state.previewLoading = false;
          state.previewUrl = null;

          state.error = action.payload || {
            message: action.error.message || "Failed to preview document.",
          };
        }
      )

      // ========================================================
      // DOWNLOAD USER DOCUMENT
      // ========================================================

      .addCase(
        downloadDocument.pending,
        (state, action) => {
          state.downloadRequestId = action.meta.requestId;
          state.downloadLoading = true;
          state.downloadUrl = null;
          state.error = null;
        }
      )

      .addCase(
        downloadDocument.fulfilled,
        (state, action) => {
          if (action.meta.requestId !== state.downloadRequestId) return;
          state.downloadRequestId = null;
          state.downloadLoading = false;
          state.downloadUrl = null;
          state.error = null;
        }
      )

      .addCase(
        downloadDocument.rejected,
        (state, action) => {
          if (action.meta.requestId !== state.downloadRequestId) return;
          state.downloadRequestId = null;
          state.downloadLoading = false;
          state.downloadUrl = null;

          state.error = action.payload || {
            message: action.error.message || "Failed to download document.",
          };
        }
      )

      // ========================================================
      // DELETE USER DOCUMENT
      // ========================================================

      .addCase(
        deleteDocument.pending,
        (state) => {
          state.isLoading = true;
          state.error = null;
        }
      )

      .addCase(
        deleteDocument.fulfilled,
        (state, action) => {
          state.isLoading = false;
          state.error = null;
          state.message = action.payload.message;

          state.documents =
            state.documents.filter(
              (document) =>
                String(
                  document._id || document.id
                ) !==
                String(action.payload.documentId)
            );

          if (
            state.selectedDocument &&
            String(
              state.selectedDocument._id ||
                state.selectedDocument.id
            ) ===
              String(action.payload.documentId)
          ) {
            state.selectedDocument = null;
          }
        }
      )

      .addCase(
        deleteDocument.rejected,
        (state, action) => {
          state.isLoading = false;

          state.error = action.payload || {
            message: action.error.message || "Failed to delete document.",
          };
        }
      )

      .addCase(retryDocumentProcessing.pending, (state, action) => {
        const id = String(action.meta.arg.documentId);
        if (!state.processingDocumentIds.includes(id)) {
          state.processingDocumentIds.push(id);
        }
        state.error = null;
      })
      .addCase(retryDocumentProcessing.fulfilled, (state, action) => {
        const id = String(action.meta.arg.documentId);
        state.processingDocumentIds = state.processingDocumentIds.filter((item) => item !== id);
        const document = action.payload;
        if (!document) return;
        const collection = action.meta.arg.admin ? state.adminDocuments : state.documents;
        const index = collection.findIndex((item) => String(item._id || item.id) === id);
        if (index >= 0) collection[index] = { ...collection[index], ...document };
        if (action.meta.arg.admin && String(state.adminSelectedDocument?._id) === id) {
          state.adminSelectedDocument = document;
        } else if (!action.meta.arg.admin && String(state.selectedDocument?._id) === id) {
          state.selectedDocument = document;
        }
      })
      .addCase(retryDocumentProcessing.rejected, (state, action) => {
        const id = String(action.meta.arg.documentId);
        state.processingDocumentIds = state.processingDocumentIds.filter((item) => item !== id);
        if (!action.meta.condition) {
          state.error = action.payload || { message: "Could not retry document processing." };
        }
      })
      .addCase(updateDocumentExtractedData.pending, (state) => {
        state.error = null;
      })
      .addCase(updateDocumentExtractedData.fulfilled, (state, action) => {
        state.error = null;
        const document = action.payload;
        if (!document) return;
        const id = String(document._id || document.id);
        const collection = action.meta.arg.admin ? state.adminDocuments : state.documents;
        const index = collection.findIndex((item) => String(item._id || item.id) === id);
        if (index >= 0) collection[index] = document;
        if (action.meta.arg.admin) state.adminSelectedDocument = document;
        else state.selectedDocument = document;
      })
      .addCase(updateDocumentExtractedData.rejected, (state, action) => {
        state.error = action.payload || { message: "Could not save extracted information." };
      })

      // ========================================================
      // ADMIN UPLOAD
      // ========================================================

      .addCase(
        adminUploadDocument.pending,
        (state) => {
          state.adminUploading = true;
          state.error = null;
          state.message = null;
        }
      )

      .addCase(
        adminUploadDocument.fulfilled,
        (state, action) => {
          state.adminUploading = false;
          state.error = null;
          state.message = action.payload.message;

          if (action.payload.document) {
            state.adminDocuments.unshift(
              action.payload.document
            );
          }
        }
      )

      .addCase(
        adminUploadDocument.rejected,
        (state, action) => {
          state.adminUploading = false;

          state.error = action.meta.aborted
            ? null
            : action.payload || {
                message: action.error.message || "Admin document upload failed.",
              };
        }
      )

      // ========================================================
      // ADMIN STATS
      // ========================================================

      .addCase(
        getDocumentStats.pending,
        (state) => {
          state.isLoading = true;
          state.adminStatsLoading = true;
          state.error = null;
        }
      )

      .addCase(
        getDocumentStats.fulfilled,
        (state, action) => {
          state.isLoading = false;
          state.adminStatsLoading = false;
          state.adminStats = action.payload;
          state.error = null;
        }
      )

      .addCase(
        getDocumentStats.rejected,
        (state, action) => {
          state.isLoading = false;
          state.adminStatsLoading = false;

          state.error = action.payload || {
            message: action.error.message || "Failed to fetch document statistics.",
          };
        }
      )

      // ========================================================
      // ADMIN ALL DOCUMENTS
      // ========================================================

      .addCase(
        getAllDocumentsAdmin.pending,
        (state, action) => {
          state.adminDocumentsRequestId = action.meta.requestId;
          state.isLoading = true;
          state.adminDocumentsLoading = true;
          state.error = null;
        }
      )

      .addCase(
        getAllDocumentsAdmin.fulfilled,
        (state, action) => {
          if (action.meta.requestId !== state.adminDocumentsRequestId) return;
          state.adminDocumentsRequestId = null;
          state.isLoading = false;
          state.adminDocumentsLoading = false;
          state.error = null;

          state.adminDocuments =
            action.payload?.documents || [];

          state.adminDocumentsPagination =
            getPagination(
              action.payload?.pagination
            );
        }
      )

      .addCase(
        getAllDocumentsAdmin.rejected,
        (state, action) => {
          if (action.meta.requestId !== state.adminDocumentsRequestId) return;
          state.adminDocumentsRequestId = null;
          state.isLoading = false;
          state.adminDocumentsLoading = false;

          state.error = action.payload || {
            message: action.error.message || "Failed to fetch admin documents.",
          };
        }
      )

      // ========================================================
      // ADMIN GET DOCUMENT
      // ========================================================

      .addCase(
        getAdminDocumentById.pending,
        (state, action) => {
          state.isLoading = true;
          state.adminDocumentLoading = true;
          state.adminDocumentRequestId = action.meta.requestId;
          state.error = null;
        }
      )

      .addCase(
        getAdminDocumentById.fulfilled,
        (state, action) => {
          if (action.meta.requestId !== state.adminDocumentRequestId) return;
          state.isLoading = false;
          state.adminDocumentLoading = false;
          state.adminDocumentRequestId = null;
          state.adminSelectedDocument =
            action.payload;
          state.error = null;
        }
      )

      .addCase(
        getAdminDocumentById.rejected,
        (state, action) => {
          if (action.meta.requestId !== state.adminDocumentRequestId) return;
          state.isLoading = false;
          state.adminDocumentLoading = false;
          state.adminDocumentRequestId = null;
          state.adminSelectedDocument = null;

          state.error = action.payload || {
            message: action.error.message || "Failed to fetch admin document.",
          };
        }
      )

      // ========================================================
      // ADMIN PREVIEW
      // ========================================================

      .addCase(
        previewAdminDocument.pending,
        (state, action) => {
          state.previewRequestId = action.meta.requestId;
          state.previewLoading = true;
          state.previewUrl = null;
          state.error = null;
        }
      )

      .addCase(
        previewAdminDocument.fulfilled,
        (state, action) => {
          if (action.meta.requestId !== state.previewRequestId) return;
          state.previewRequestId = null;
          state.previewLoading = false;
          state.previewUrl = null;
          state.error = null;
        }
      )

      .addCase(
        previewAdminDocument.rejected,
        (state, action) => {
          if (action.meta.requestId !== state.previewRequestId) return;
          state.previewRequestId = null;
          state.previewLoading = false;
          state.previewUrl = null;

          state.error = action.payload || {
            message: action.error.message || "Failed to preview admin document.",
          };
        }
      )

      // ========================================================
      // ADMIN DOWNLOAD
      // ========================================================

      .addCase(
        downloadAdminDocument.pending,
        (state, action) => {
          state.downloadRequestId = action.meta.requestId;
          state.downloadLoading = true;
          state.downloadUrl = null;
          state.error = null;
        }
      )

      .addCase(
        downloadAdminDocument.fulfilled,
        (state, action) => {
          if (action.meta.requestId !== state.downloadRequestId) return;
          state.downloadRequestId = null;
          state.downloadLoading = false;
          state.downloadUrl = null;
          state.error = null;
        }
      )

      .addCase(
        downloadAdminDocument.rejected,
        (state, action) => {
          if (action.meta.requestId !== state.downloadRequestId) return;
          state.downloadRequestId = null;
          state.downloadLoading = false;
          state.downloadUrl = null;

          state.error = action.payload || {
            message: action.error.message || "Failed to download admin document.",
          };
        }
      )

      // ========================================================
      // ADMIN DELETE DOCUMENT
      // ========================================================

      .addCase(
        deleteAdminDocument.pending,
        (state) => {
          state.isLoading = true;
          state.error = null;
        }
      )

      .addCase(
        deleteAdminDocument.fulfilled,
        (state, action) => {
          state.isLoading = false;
          state.error = null;
          state.message = action.payload.message;

          state.adminDocuments =
            state.adminDocuments.filter(
              (document) =>
                String(
                  document._id || document.id
                ) !==
                String(action.payload.documentId)
            );

          if (
            state.adminSelectedDocument &&
            String(
              state.adminSelectedDocument._id ||
                state.adminSelectedDocument.id
            ) ===
              String(action.payload.documentId)
          ) {
            state.adminSelectedDocument = null;
          }
        }
      )

      .addCase(
        deleteAdminDocument.rejected,
        (state, action) => {
          state.isLoading = false;

          state.error = action.payload || {
            message: action.error.message || "Failed to delete admin document.",
          };
        }
      );
  },
});

/*
|--------------------------------------------------------------------------
| Actions
|--------------------------------------------------------------------------
*/

export const {
  clearDocumentError,
  clearDocumentMessage,

  clearSelectedDocument,
  clearAdminSelectedDocument,
  setAdminSelectedDocument,

  clearPreviewBlob,
  clearDownloadBlob,

  clearDocuments,
  clearWorkspaceDocuments,
  clearAdminDocuments,

  resetDocumentState,
} = documentSlice.actions;

/*
|--------------------------------------------------------------------------
| Selectors
|--------------------------------------------------------------------------
*/

export const selectDocumentState = (state) =>
  state.documents;

export const selectDocuments = (state) =>
  state.documents.documents;

export const selectSelectedDocument = (state) =>
  state.documents.selectedDocument;

export const selectDocumentsPagination = (state) =>
  state.documents.documentsPagination;

export const selectDocumentLibraries = (state) =>
  state.documents.documentLibraries;

export const selectDocumentLibrariesLoading = (state) =>
  state.documents.documentLibrariesLoading;

export const selectLibraryDocuments = (state) =>
  state.documents.libraryDocuments;

export const selectSelectedLibrary = (state) =>
  state.documents.selectedLibrary;

export const selectLibraryDocumentsLoading = (state) =>
  state.documents.libraryDocumentsLoading;

export const selectLibraryError = (state) =>
  state.documents.libraryError;

export const selectAdminDocuments = (state) =>
  state.documents.adminDocuments;

export const selectAdminSelectedDocument = (state) =>
  state.documents.adminSelectedDocument;

export const selectAdminDocumentsPagination = (state) =>
  state.documents.adminDocumentsPagination;

export const selectAdminDocumentsLoading = (state) =>
  state.documents.adminDocumentsLoading;

export const selectAdminDocumentLoading = (state) =>
  state.documents.adminDocumentLoading;

export const selectSelectedDocumentLoading = (state) =>
  state.documents.selectedDocumentLoading;

export const selectAdminStats = (state) =>
  state.documents.adminStats;

export const selectAdminStatsLoading = (state) =>
  state.documents.adminStatsLoading;

export const selectDocumentUploading = (state) =>
  state.documents.uploading;

export const selectAdminDocumentUploading = (state) =>
  state.documents.adminUploading;

export const selectDocumentPreviewLoading = (state) =>
  state.documents.previewLoading;

export const selectDocumentDownloadLoading = (state) =>
  state.documents.downloadLoading;

export const selectDocumentPreviewBlob = (state) =>
  state.documents.previewUrl;

export const selectDocumentDownloadBlob = (state) =>
  state.documents.downloadUrl;

export const selectDocumentLoading = (state) =>
  state.documents.isLoading;

export const selectDocumentError = (state) =>
  state.documents.error;

export const selectDocumentMessage = (state) =>
  state.documents.message;

export default documentSlice.reducer;
