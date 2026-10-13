
import axios from "axios";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8080";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  withCredentials: true,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

let refreshRequest = null;

/*
 * Authentication uses backend-managed HTTP-only cookies.
 * Keep auth failures rejected so callers can handle them.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
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
