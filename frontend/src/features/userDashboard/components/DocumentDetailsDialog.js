"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { FileText, Pencil, RotateCw, Save, X } from "lucide-react";
import { swallowAbortError } from "@/lib/api";
import {
  getDocumentById,
  retryDocumentProcessing,
  selectDocumentError,
  selectSelectedDocumentLoading,
  selectSelectedDocument,
  updateDocumentExtractedData,
} from "@/features/document/documentSlice";
import {
  ExtractedDataEditor,
  ExtractedDataViewer,
} from "@/features/document/components/ExtractedData";
import {
  documentProcessingCheckDelay,
  documentProcessingCheckKey,
  documentStatusLabel,
  hasExtractedData,
  safeProcessingError,
} from "@/features/document/documentPresentation";

function getId(value) {
  return String(value?._id || value?.id || value || "");
}

function safeError(error, fallback) {
  const status = error?.status || error?.payload?.status;
  if (status === 409) {
    return "This document is already being processed.";
  }
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) return "You do not have permission to change this document.";
  const message =
    typeof error === "string"
      ? error
      : error?.message || error?.payload?.message || "";
  if (
    !message ||
    message.length > 240 ||
    /request failed|network error|timeout|axios|status code|stack|trace|exception|api.?key|token|mongo|redis|database|worker|https?:\/\/|access.?denied|\bECONN\w*|\bat\s+\S+\s+\(/i.test(message)
  ) {
    return fallback;
  }
  return message;
}

export default function DocumentDetailsDialog({
  documentItem,
  ownerId,
  onClose,
  onProcessingCheck,
}) {
  const router = useRouter();
  const dispatch = useDispatch();
  const selected = useSelector(selectSelectedDocument);
  const loading = useSelector(selectSelectedDocumentLoading);
  const requestError = useSelector(selectDocumentError);
  const [retrying, setRetrying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [feedback, setFeedback] = useState(null);
  const retryLock = useRef(false);
  const checkedProcessingCycleRef = useRef(null);
  const statusRefreshRequestRef = useRef(null);
  const dialogRef = useRef(null);
  const documentId = getId(documentItem);
  const documentOwnerId = ownerId || getId(documentItem?.userId);
  const document = getId(selected) === documentId ? selected : documentItem;
  const documentStatus = document?.status;
  const processingCheckKey = documentProcessingCheckKey(document);
  const processingCheckDelay = documentProcessingCheckDelay(document);
  const extractedDataAvailable = hasExtractedData(document?.data);

  useEffect(() => {
    dialogRef.current?.focus();
    const isPending = ["queued", "processing"].includes(documentStatus);
    if (
      processingCheckKey &&
      checkedProcessingCycleRef.current === processingCheckKey
    ) {
      return undefined;
    }

    const delay = isPending ? processingCheckDelay : 0;

    if (delay > 0 && !extractedDataAvailable) {
      let request;
      const timer = window.setTimeout(() => {
        checkedProcessingCycleRef.current = processingCheckKey;
        onProcessingCheck?.(processingCheckKey);
        request = dispatch(getDocumentById({
          documentId,
          ownerId: documentOwnerId,
        }));
        request.catch(swallowAbortError);
      }, delay);
      return () => {
        window.clearTimeout(timer);
        request?.abort();
      };
    }

    if (isPending) {
      checkedProcessingCycleRef.current = processingCheckKey;
      onProcessingCheck?.(processingCheckKey);
    }
    const request = dispatch(getDocumentById({
      documentId,
      ownerId: documentOwnerId,
    }));
    request.catch(swallowAbortError);
    return () => request.abort();
  }, [
    dispatch,
    documentId,
    documentOwnerId,
    documentStatus,
    extractedDataAvailable,
    processingCheckDelay,
    processingCheckKey,
    onProcessingCheck,
  ]);

  useEffect(() => {
    if (requestError?.status === 401) router.replace("/");
  }, [requestError, router]);

  useEffect(() => () => statusRefreshRequestRef.current?.abort(), []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !saving && !retrying) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, retrying, saving]);

  const retry = async () => {
    if (retryLock.current || retrying) return;
    retryLock.current = true;
    setRetrying(true);
    setFeedback(null);
    try {
      await dispatch(retryDocumentProcessing({
        documentId,
        ownerId: documentOwnerId,
      })).unwrap();
    } catch (error) {
      setFeedback({
        type: "error",
        text: safeError(error, "Could not retry processing. Please try again."),
      });
    } finally {
      retryLock.current = false;
      setRetrying(false);
    }
  };

  const refreshStatus = async () => {
    setFeedback(null);
    const request = dispatch(getDocumentById({
      documentId,
      ownerId: documentOwnerId,
    }));
    statusRefreshRequestRef.current = request;
    try {
      await request.unwrap();
      setFeedback({ type: "success", text: "Document status updated." });
    } catch (error) {
      if (error?.name !== "AbortError") {
        setFeedback({
          type: "error",
          text: "We couldn't refresh the document status. Check your connection and try again.",
        });
      }
    } finally {
      if (statusRefreshRequestRef.current === request) {
        statusRefreshRequestRef.current = null;
      }
    }
  };

  const beginEditing = () => {
    const value = document?.data;
    setDraft(
      value && typeof value === "object" && !Array.isArray(value)
        ? structuredClone(value)
        : {}
    );
    setEditing(true);
    setFeedback(null);
  };

  const saveChanges = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      await dispatch(updateDocumentExtractedData({
        documentId,
        data: draft,
        ownerId: documentOwnerId,
      })).unwrap();
      setEditing(false);
      setFeedback({ type: "success", text: "Extracted information saved." });
    } catch (error) {
      setFeedback({
        type: "error",
        text: safeError(error, "Could not save extracted information. Please try again."),
      });
    } finally {
      setSaving(false);
    }
  };

  const documentLoaded = getId(selected) === documentId;
  const failed = document?.status === "failed";
  const dataAvailable = hasExtractedData(document?.data);
  const editableData =
    document?.data &&
    typeof document.data === "object" &&
    !Array.isArray(document.data) &&
    Object.keys(document.data).length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3 sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving && !retrying) onClose();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl outline-none sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-details-title"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <FileText size={19} />
            </span>
            <div className="min-w-0">
              <h2 id="document-details-title" className="truncate text-base font-semibold text-[#0F172A]">
                {document?.displayName || document?.fileName || "Document"}
              </h2>
              <p className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                failed
                  ? "bg-rose-50 text-rose-700"
                  : ["queued", "processing"].includes(document?.status)
                    ? "bg-amber-50 text-amber-800"
                    : document?.status === "processed"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
              }`}>
                {documentStatusLabel(document?.status)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving || retrying}
            aria-label="Close document details"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            <X size={19} />
          </button>
        </header>

        {feedback ? (
          <p
            className={`mt-4 rounded-xl px-4 py-3 text-sm ${
              feedback.type === "error"
                ? "bg-rose-50 text-rose-800"
                : "bg-emerald-50 text-emerald-800"
            }`}
            role={feedback.type === "error" ? "alert" : "status"}
          >
            {feedback.text}
          </p>
        ) : null}

        {loading && !documentLoaded ? (
          <div className="py-12 text-center" role="status">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />
            <p className="mt-3 text-sm text-slate-500">Loading document…</p>
          </div>
        ) : requestError && !documentLoaded ? (
          <p className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
            {requestError.message || "Could not load this document."}
          </p>
        ) : (
          <div className="space-y-5 py-5">
            {failed ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4">
                <h3 className="font-semibold text-rose-900">Processing failed</h3>
                <p className="mt-2 text-sm text-rose-800">
                  {safeProcessingError(document?.processingError)}
                </p>
                <button
                  type="button"
                  onClick={retry}
                  disabled={retrying}
                  className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RotateCw size={15} />
                  {retrying ? "Retrying…" : "Retry"}
                </button>
              </div>
            ) : null}

            {["queued", "processing"].includes(document?.status) ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p role="status">
                  {document.status === "queued" ? "Waiting for processing." : "Processing…"}
                  {" "}If the status doesn&apos;t change, refresh it here.
                </p>
                <button
                  type="button"
                  onClick={refreshStatus}
                  disabled={loading}
                  className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60"
                >
                  <RotateCw size={15} className={loading ? "animate-spin" : ""} />
                  {loading ? "Checking…" : "Refresh status"}
                </button>
              </div>
            ) : null}

            {document?.status === "uploaded" ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700" role="status">
                Your document has been uploaded and is waiting to be processed.
              </p>
            ) : null}

            {document?.status === "processed" ? (
              <section className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-indigo-950">Extracted information</h3>
                  {editableData && !editing ? (
                    <button
                      type="button"
                      onClick={beginEditing}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      <Pencil size={15} /> Edit
                    </button>
                  ) : null}
                </div>
                {editing ? (
                  <form onSubmit={saveChanges}>
                    <ExtractedDataEditor data={draft} onChange={setDraft} />
                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(false)}
                        disabled={saving}
                        className="min-h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#0F172A] px-4 text-sm font-semibold text-white transition hover:bg-[#1E293B] disabled:opacity-60"
                      >
                        {saving ? <RotateCw size={15} className="animate-spin" /> : <Save size={15} />}
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </form>
                ) : dataAvailable ? (
                  <ExtractedDataViewer data={document?.data} />
                ) : (
                  <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    No extracted information is available for this document.
                  </p>
                )}
              </section>
            ) : null}

            {document?.confidence !== null && document?.confidence !== undefined ? (
              <p className="text-xs text-slate-500">
                Confidence: {Math.round(Number(document.confidence) * 100)}%
              </p>
            ) : null}

            {document?.rawText ? (
              <details className="rounded-xl border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">
                  Raw extracted text
                </summary>
                <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-600">
                  {String(document.rawText)}
                </pre>
              </details>
            ) : null}

            {document?.processedAt ? (
              <p className="text-xs text-slate-500">
                Processed {new Date(document.processedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
