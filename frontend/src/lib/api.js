
import axios from "axios";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8080";

const stripUndefinedQueryValues = (value) => {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
};

const normalizeRequestParams = (params) => {
  if (!params || typeof params !== "object") return params;
  return Object.fromEntries(
    Object.entries(params).filter(([, paramValue]) => stripUndefinedQueryValues(paramValue))
  );
};

const getRequestCacheKey = (method, url, config = {}) => {
  const params = normalizeRequestParams(config.params);
  return `${String(method).toUpperCase()}:${String(url || "")}:${JSON.stringify(params || {})}`;
};

export const isAbortError = (error) =>
  error?.name === "AbortError" ||
  error?.code === "ERR_CANCELED" ||
  error?.message === "canceled" ||
  error?.message === "The user aborted a request.";

export const swallowAbortError = (error) => {
  if (isAbortError(error)) {
    return undefined;
  }
  throw error;
};

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  withCredentials: true,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

const pendingGetRequests = new Map();
const originalGet = api.get.bind(api);

api.get = (...args) => {
  const [url, config] = args;
  if (config?.signal) {
    return originalGet(...args);
  }

  const requestKey = getRequestCacheKey("get", url, config || {});
  if (pendingGetRequests.has(requestKey)) {
    return pendingGetRequests.get(requestKey);
  }

  const requestPromise = originalGet(...args);
  pendingGetRequests.set(requestKey, requestPromise);
  const clearPendingRequest = () => {
    if (pendingGetRequests.get(requestKey) === requestPromise) {
      pendingGetRequests.delete(requestKey);
    }
  };
  requestPromise.then(clearPendingRequest, clearPendingRequest);

  return requestPromise;
};

let refreshRequest = null;

/*
 * Authentication uses backend-managed HTTP-only cookies.
 * Keep auth failures rejected so callers can handle them.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (isAbortError(error)) {
      return Promise.reject(error);
    }

    const request = error.config;
    const isRefreshRequest = request?.url?.includes("/api/auth/refresh");

    if (
      error.response?.status === 401 &&
      request &&
      !request._authRetry &&
      !isRefreshRequest
    ) {
      request._authRetry = true;
      refreshRequest ??= api
        .post("/api/auth/refresh", {}, { withCredentials: true })
        .finally(() => {
          refreshRequest = null;
        });

      return refreshRequest
        .then(() => api.request(request))
        .catch(() => Promise.reject(error));
    }

    console.warn("[API] Request failed", {
      method: error.config?.method?.toUpperCase() || null,
      endpoint: error.config?.url || null,
      status: error.response?.status || null,
      code: error.code || null,
    });
    return Promise.reject(error);
  }
);
