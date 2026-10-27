import { api } from "../../lib/api.js";

let authRecovery;
let lastAuthRecovery = 0;

export function subscribeToDocumentProcessingEvents({ onEvent, onOpen, ownerId }) {
  const baseUrl = api.defaults.baseURL || window.location.origin;
  const eventUrl = new URL("/api/documents/events", baseUrl);
  if (ownerId) eventUrl.searchParams.set("ownerId", ownerId);
  const source = new EventSource(eventUrl, { withCredentials: true });
  const receivedEventIds = new Set();

  source.onopen = () => onOpen?.();
  source.addEventListener("document-status", (message) => {
    try {
      const event = JSON.parse(message.data);
      if (
        !event ||
        typeof event.documentId !== "string" ||
        !["processed", "failed"].includes(event.status)
      ) {
        console.warn("Ignored an invalid document processing event.");
        return;
      }
      if (event.eventId && receivedEventIds.has(event.eventId)) return;
      if (event.eventId) {
        receivedEventIds.add(event.eventId);
        if (receivedEventIds.size > 500) {
          receivedEventIds.delete(receivedEventIds.values().next().value);
        }
      }
      onEvent(event);
    } catch (error) {
      console.warn("Could not read a document processing event:", error.message);
    }
  });
  source.onerror = () => {
    if (authRecovery || Date.now() - lastAuthRecovery < 30000) return;
    lastAuthRecovery = Date.now();
    authRecovery = api
      .get("/api/auth/session", { withCredentials: true })
      .catch((error) => {
        console.warn("Could not refresh the session for document updates:", {
          status: error.response?.status || null,
          code: error.code || null,
        });
      })
      .finally(() => {
        authRecovery = null;
      });
  };

  return () => source.close();
}
