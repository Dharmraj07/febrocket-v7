"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  Info,
  Link2,
  MoreHorizontal,
  Printer,
  Share2,
  Trash2,
  Upload,
  Unlink,
  UserRound,
  X,
} from "lucide-react";
import { selectAuth } from "@/features/auth/authSlice";
import { api, swallowAbortError } from "@/lib/api";
import {
  clearDocumentError,
  clearDocumentMessage,
  clearWorkspaceDocuments,
  deleteDocument,
  downloadDocument,
  getDocuments,
  getDocumentLibraries,
  getDocumentById,
  getLibraryDocuments,
  previewDocument as fetchDocumentPreview,
  selectDocumentLibraries,
  selectDocumentLibrariesLoading,
  selectDocumentError,
  selectDocumentLoading,
  selectDocumentUploading,
  selectLibraryDocuments,
  selectLibraryDocumentsLoading,
  selectLibraryError,
  selectDocuments,
  selectDocumentsPagination,
  uploadDocument,
} from "@/features/document/documentSlice";
import UserWorkspaceShell from "@/features/dashboard/components/UserWorkspaceShell";
import { MessagesContent } from "@/features/messages/components/UserMessagesPage";
import DocumentDetailsDialog from "./DocumentDetailsDialog";
import DocumentPropertiesDialog from "./DocumentPropertiesDialog";
import {
  documentStatusLabel,
  documentProcessingCheckDelay,
  documentProcessingCheckKey,
  libraryDocumentId,
  safeProcessingError,
} from "@/features/document/documentPresentation";
import { subscribeToDocumentProcessingEvents } from "@/features/document/documentEvents";

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const DOCUMENT_OVERLAY_HISTORY_KEY = "__febrocketDocumentOverlay";
const DOCUMENT_VIEW_HISTORY_KEY = "__febrocketDashboardView";
const ALLOWED_UPLOAD_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function formatDate(date) {
  if (!date) {
    return "Added recently";
  }

  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return "Added recently";
  }

  const today = new Date();
  if (parsedDate.toDateString() === today.toDateString()) {
    return "Added today";
  }

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (parsedDate.toDateString() === yesterday.toDateString()) {
    return "Added yesterday";
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getFileTypeMeta(fileName, fileType) {
  const lowerName = (fileName || "").toLowerCase();
  const lowerType = (fileType || "").toLowerCase();

  if (lowerType.includes("pdf") || lowerName.endsWith(".pdf")) {
    return {
      icon: FileText,
      accent: "border-slate-200 bg-slate-50 text-slate-600",
      label: "PDF",
    };
  }

  if (lowerType.startsWith("image/") || /\.(png|jpg|jpeg|webp|gif|heic|heif)$/i.test(lowerName)) {
    const extension = lowerName.match(/\.(png|jpe?g|webp|gif|heic|heif)$/i)?.[1];
    const label = (extension || lowerType.split("/")[1] || "Image").toUpperCase();
    return {
      icon: ImageIcon,
      accent: "border-slate-200 bg-slate-50 text-slate-600",
      label: label === "JPG" ? "JPEG" : label,
    };
  }

  return {
    icon: FileText,
    accent: "border-slate-200 bg-slate-50 text-slate-600",
    label: "Document",
  };
}

function getDocumentId(documentItem) {
  return String(documentItem?._id || documentItem?.id || "");
}

function isPreviewableDocument(documentItem) {
  return (
    documentItem?.fileType?.startsWith("image/") ||
    documentItem?.fileType?.includes("pdf") ||
    /\.(png|jpe?g|webp|gif|heic|heif|pdf)$/i.test(documentItem?.fileName || "")
  );
}

function previewErrorMessage(error) {
  if (error?.status === 404) {
    return "This document is no longer available. Refresh your documents and try again.";
  }
  if (error?.status === 401) {
    return "Your session may have expired. Sign in again, then try opening this document.";
  }
  if (!error?.status) {
    return "We couldn't open this document because of a connection problem. Your document hasn't been deleted. Check your connection and try again.";
  }
  return "We couldn't open this document. Your document hasn't been deleted. Please try again.";
}

function getReadableDocumentName(documentItem) {
  if (documentItem?.displayName?.trim()) return documentItem.displayName.trim();
  return (documentItem?.fileName || "Untitled document")
    .replace(/\.[^.]+$/u, "")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function getDocumentOwnerId(documentItem) {
  return String(documentItem?.userId?._id || documentItem?.userId || "");
}

function DocumentActionMenu({
  documentItem,
  canDelete,
  open,
  menuRef,
  triggerRef,
  onToggle,
  onClose,
  onPreview,
  onDownload,
  onDelete,
}) {
  const label = getReadableDocumentName(documentItem);

  return (
    <div className="relative shrink-0" ref={open ? menuRef : null}>
      <button
        type="button"
        ref={open ? triggerRef : null}
        onClick={onToggle}
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-offset-2"
      >
        <MoreHorizontal size={20} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={`Document actions for ${label}`}
          className="absolute right-0 top-10 z-20 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { onClose(); onPreview(); }}
            className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            <ArrowUpRight size={16} /> Preview
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { onClose(); onDownload(); }}
            className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            <Download size={16} /> Download
          </button>
          {canDelete ? (
            <>
              <div className="my-1 border-t border-slate-100" />
              <button
                type="button"
                role="menuitem"
                onClick={() => { onClose(); onDelete(); }}
                className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <Trash2 size={16} /> Delete
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function trapDialogFocus(event) {
  if (event.key !== "Tab") return;

  const focusableElements = event.currentTarget.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (!focusableElements.length) return;

  const first = focusableElements[0];
  const last = focusableElements[focusableElements.length - 1];
  if (
    document.activeElement === event.currentTarget ||
    !event.currentTarget.contains(document.activeElement)
  ) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function getConnectionData(response) {
  const data = response.data?.data;
  if (data?.connected === false && data.user === null) {
    return { connected: false, user: null };
  }
  if (
    data?.connected === true &&
    data.user &&
    typeof data.user.userName === "string" &&
    ["owner", "viewer"].includes(data.role)
  ) {
    return data;
  }
  throw new Error("Connection status could not be confirmed.");
}

function getShareActionError(requestError, action) {
  const apiMessage = requestError.response?.data?.message?.toLowerCase() || "";
  if (apiMessage.includes("invalid or expired")) {
    return "That code is invalid or has expired. Ask for a new code and try again.";
  }
  if (apiMessage.includes("cannot connect to yourself")) {
    return "You can't connect an account to itself. Use a code from another person.";
  }
  if (apiMessage.includes("no longer available")) {
    return "That code is no longer available. Ask for a new code and try again.";
  }
  if (requestError.response?.status === 429) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (action === "generate") {
    return "We couldn't generate a code. Please try again.";
  }
  if (action === "connect") {
    return "We couldn't connect these accounts. Check the code and try again.";
  }
  if (action === "disconnect") {
    return "We couldn't disconnect this account. Please try again.";
  }
  return "We couldn't complete that action. Please try again.";
}

function ShareWorkspace() {
  const [connection, setConnection] = useState(null);
  const [shareCode, setShareCode] = useState(null);
  const [connectCode, setConnectCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [connectError, setConnectError] = useState("");
  const [message, setMessage] = useState("");
  const actionLockRef = useRef(false);
  const connected = Boolean(connection?.connected && connection?.user);
  const shareCodeExpiry = shareCode ? new Date(shareCode.expiresAt).getTime() : 0;
  const shareCodeExpired = Boolean(shareCode && currentTime >= shareCodeExpiry);
  const remainingSeconds = Math.max(
    0,
    Math.ceil((shareCodeExpiry - currentTime) / 1000)
  );
  const codeCharactersValid = /^[A-Z0-9]*$/.test(connectCode);
  const connectCodeValid = /^[A-Z0-9]{4}$/.test(connectCode);

  const fetchConnection = useCallback(
    () => api.get("/api/auth/share/connection"),
    []
  );

  const loadConnection = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchConnection();
      setConnection(getConnectionData(response));
    } catch {
      setConnection(null);
      setError("We couldn't check your connection. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [fetchConnection]);

  useEffect(() => {
    let active = true;
    fetchConnection()
      .then((response) => {
        if (active) setConnection(getConnectionData(response));
      })
      .catch(() => {
        if (active) {
          setConnection(null);
          setError("We couldn't check your connection. Please try again.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchConnection]);

  useEffect(() => {
    if (!shareCode || shareCodeExpired) return undefined;
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [shareCode, shareCodeExpired]);

  const performAction = async (action, request, onSuccess, fallbackMessage) => {
    if (actionLockRef.current) return false;
    actionLockRef.current = true;
    setBusyAction(action);
    setError("");
    setMessage("");
    try {
      const response = await request();
      onSuccess(response);
      setMessage(response.data?.message || fallbackMessage);
      return true;
    } catch (requestError) {
      const actionError = getShareActionError(requestError, action);
      setError(actionError);
      if (action === "connect") setConnectError(actionError);
      return false;
    } finally {
      actionLockRef.current = false;
      setBusyAction("");
    }
  };

  const generateCode = () => {
    setConnectError("");
    return performAction(
      "generate",
      () => api.post("/api/auth/share/code"),
      (response) => {
        const generatedCode = response.data?.data;
        const expiresAt = new Date(generatedCode?.expiresAt);
        if (
          typeof generatedCode?.code !== "string" ||
          !/^[A-Z0-9]{4}$/.test(generatedCode.code) ||
          !Number.isFinite(expiresAt.getTime()) ||
          expiresAt.getTime() <= Date.now()
        ) {
          throw new Error("The sharing code could not be confirmed.");
        }
        setShareCode({
          code: generatedCode.code,
          expiresAt: expiresAt.toISOString(),
        });
        setCurrentTime(Date.now());
      },
      "Sharing code generated."
    );
  };

  const cancelCode = () => {
    setConnectError("");
    return performAction(
      "cancel",
      () => api.delete("/api/auth/share/code"),
      () => setShareCode(null),
      "Sharing code cancelled."
    );
  };

  const connectAccount = async (event) => {
    event.preventDefault();
    const code = connectCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code) || loading || !connection) return;

    await performAction(
      "connect",
      () => api.post("/api/auth/share/connect", { code }),
      (response) => {
        const data = response.data?.data;
        if (
          data?.connected !== true ||
          !data.user ||
          typeof data.user.userName !== "string" ||
          data.role !== "viewer"
        ) {
          throw new Error("The connection could not be confirmed.");
        }
        setConnection(data);
        setConnectCode("");
        setConnectError("");
        setShareCode(null);
      },
      "Accounts connected."
    );
  };

  const disconnectAccount = () => {
    if (!window.confirm("Disconnect this account? You can connect again with a new code.")) {
      return;
    }
    return performAction(
      "disconnect",
      () => api.delete("/api/auth/share/connection"),
      () => {
        setConnection({ connected: false, user: null });
        setShareCode(null);
      },
      "Account disconnected."
    );
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(shareCode.code);
      setError("");
      setMessage("Sharing code copied.");
    } catch {
      setError("We couldn't copy the code. You can select and copy it manually.");
    }
  };

  return (
    <div className="mx-auto max-w-[1040px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <section aria-labelledby="share-heading">
        <header className="max-w-3xl">
          <h1 id="share-heading" className="text-2xl font-semibold tracking-tight text-[#0F172A] sm:text-3xl">
            Connect accounts
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Share access to your documents with one person, or use their code to access theirs. Sharing is one-way.
          </p>
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-600" role="status" aria-live="polite">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                loading || busyAction
                  ? "animate-pulse bg-blue-500"
                  : connected
                    ? "bg-emerald-500"
                    : connection === null && error
                      ? "bg-amber-500"
                      : "bg-slate-400"
              }`}
              aria-hidden="true"
            />
            {loading
              ? "Checking connection…"
              : busyAction === "generate"
                ? "Generating code…"
                : busyAction === "connect"
                  ? "Connecting…"
                  : busyAction === "disconnect"
                    ? "Disconnecting…"
                    : connected
                      ? connection.role === "owner"
                        ? `Sharing your documents with ${connection.user.userName}`
                        : `Accessing ${connection.user.userName}'s documents`
                      : connection === null && error
                        ? "Connection status unavailable"
                        : "Not connected"}
          </p>
        </header>

        {error ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
            <span>{error}</span>
            {connection === null && (
              <button
                type="button"
                onClick={() => void loadConnection()}
                disabled={loading || Boolean(busyAction)}
                className="min-h-10 rounded-lg border border-rose-200 bg-white px-4 font-semibold text-rose-800 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Try again
              </button>
            )}
          </div>
        ) : null}

        {message ? (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}

        <p className="mt-4 max-w-4xl text-sm leading-6 text-slate-500">
          The person redeeming a code can view, download, edit extracted information,
          and organize the code owner&apos;s documents. They cannot upload or delete.
          Changes are saved to the owner&apos;s account. Either person can disconnect;
          connecting to someone else replaces the previous connection.
        </p>

        {loading ? (
          <div className="mt-5 border-t border-slate-200 py-8 text-sm text-slate-600" role="status">
            Checking your connection…
          </div>
        ) : connection ? (
          <div className="mt-5 grid max-w-4xl gap-5 md:grid-cols-2">
            {!connected ? (
              <>
            <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="generate-share-code-heading">
              <div>
                <h2 id="generate-share-code-heading" className="font-semibold text-slate-900">
                  Share your connection code
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  It expires after 10 minutes. A new code replaces the previous one.
                </p>
              </div>

              {shareCode && !shareCodeExpired ? (
                <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/70 p-4" aria-live="polite">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">
                    Your code
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                    <p className="font-mono text-3xl font-bold tracking-[0.28em] text-slate-900" aria-label={`Connection code ${shareCode.code}`}>
                      {shareCode.code}
                    </p>
                    <button
                      type="button"
                      onClick={() => void copyCode()}
                      disabled={Boolean(busyAction)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-sm font-semibold text-blue-800 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Copy size={15} aria-hidden="true" />
                      Copy code
                    </button>
                  </div>
                  <p className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                    <Clock3 size={15} aria-hidden="true" />
                    <span>
                      Expires in {Math.floor(remainingSeconds / 60)}:
                      {String(remainingSeconds % 60).padStart(2, "0")}
                      {" · "}
                      <time dateTime={shareCode.expiresAt}>
                        {new Date(shareCode.expiresAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </time>
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => void cancelCode()}
                    disabled={Boolean(busyAction)}
                    className="mt-3 min-h-9 text-sm font-medium text-slate-600 underline underline-offset-2 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyAction === "cancel" ? "Cancelling code…" : "Cancel code"}
                  </button>
                </div>
              ) : shareCodeExpired ? (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4" role="status">
                  <p className="font-semibold text-amber-900">This code has expired</p>
                  <p className="mt-1 text-sm leading-5 text-amber-800">
                    Generate a new code to continue. The expired code can no longer connect accounts.
                  </p>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void generateCode()}
                disabled={Boolean(busyAction)}
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2878f0] px-4 text-sm font-semibold text-white transition hover:bg-[#1e63d6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Share2 size={16} aria-hidden="true" />
                {busyAction === "generate"
                  ? "Generating code…"
                  : shareCode
                    ? "Generate a new code"
                    : "Generate code"}
              </button>
            </section>

            <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="connect-share-code-heading">
              <div>
                <h2 id="connect-share-code-heading" className="font-semibold text-slate-900">
                  Connect using a code
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Enter the four-character code shared with you.
                  {connected ? " This replaces your current connection." : ""}
                </p>
              </div>
              <form onSubmit={connectAccount} className="mt-5 flex flex-1 flex-col gap-3">
                <label htmlFor="share-code-input" className="text-sm font-medium text-slate-700">
                  Connection code
                </label>
                <input
                  id="share-code-input"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={4}
                  value={connectCode}
                  onChange={(event) => {
                    setConnectCode(event.target.value.toUpperCase());
                    setConnectError("");
                    setError("");
                  }}
                  placeholder="A7K2"
                  aria-invalid={Boolean(connectError || (connectCode && !codeCharactersValid))}
                  aria-describedby="share-code-help share-code-validation"
                  disabled={Boolean(busyAction)}
                  className="min-h-12 w-full rounded-xl border border-slate-300 px-4 font-mono text-lg font-semibold tracking-[0.25em] uppercase text-slate-900 outline-none transition placeholder:font-normal placeholder:tracking-[0.2em] placeholder:text-slate-400 focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-200 disabled:bg-slate-50"
                />
                <p id="share-code-help" className="text-xs leading-5 text-slate-500">
                  Paste or type the code. Lowercase letters are converted automatically.
                </p>
                <p id="share-code-validation" className="min-h-5 text-sm text-rose-700" aria-live="polite">
                  {connectError ||
                    (connectCode && !codeCharactersValid
                      ? "Use letters A–Z and numbers 0–9 only."
                      : connectCode && !connectCodeValid
                        ? "Enter all 4 characters to continue."
                        : "")}
                </p>
                <button
                  type="submit"
                  disabled={!connectCodeValid || Boolean(busyAction) || loading}
                  className="mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Link2 size={16} aria-hidden="true" />
                  {busyAction === "connect"
                    ? "Connecting…"
                    : connected
                      ? "Switch connection"
                      : "Connect account"}
                </button>
              </form>
            </section>
              </>
            ) : null}
            {connected ? (
              <section className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="connected-account-heading">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <UserRound size={21} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-600">Connected account</p>
                <h2 id="connected-account-heading" className="mt-0.5 truncate text-lg font-semibold text-slate-900">
                  {connection.user.userName}
                </h2>
              </div>
              <button
                type="button"
                onClick={disconnectAccount}
                disabled={Boolean(busyAction)}
                className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto"
              >
                <Unlink size={16} aria-hidden="true" />
                {busyAction === "disconnect" ? "Disconnecting…" : "Disconnect account"}
              </button>
            </div>
            <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-600">
              {connection.role === "owner"
                ? `${connection.user.userName} can view, download, edit extracted information, and organize your documents. They cannot upload or delete documents. Changes are saved to your account. You cannot access their documents unless they share them with you using a separate code.`
                : `You can view, download, edit extracted information, and organize ${connection.user.userName}'s documents. You cannot upload or delete their documents. Changes are saved to their account. They cannot access your documents unless you share them using a separate code.`}
              {" "}Disconnecting removes this access immediately.
            </p>
          </section>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default function UserDashboard() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { user, isLoading } = useSelector(selectAuth);
  const currentUserId = String(user?._id || user?.id || "");
  const documents = useSelector(selectDocuments);
  const documentsPagination = useSelector(selectDocumentsPagination);
  const libraries = useSelector(selectDocumentLibraries);
  const librariesLoading = useSelector(selectDocumentLibrariesLoading);
  const libraryDocuments = useSelector(selectLibraryDocuments);
  const libraryDocumentsLoading = useSelector(selectLibraryDocumentsLoading);
  const libraryError = useSelector(selectLibraryError);
  const documentsLoading = useSelector(selectDocumentLoading);
  const uploading = useSelector(selectDocumentUploading);
  const documentError = useSelector(selectDocumentError);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadValidationError, setUploadValidationError] = useState("");
  const [selectionPreviewUrl, setSelectionPreviewUrl] = useState("");
  const [previewDocument, setPreviewDocument] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloadPending, setDownloadPending] = useState(false);
  const [documentDetailsTarget, setDocumentDetailsTarget] = useState(null);
  const [propertiesTarget, setPropertiesTarget] = useState(null);
  const [dashboardView, setDashboardView] = useState("browse");
  const [workspaceOwnerId, setWorkspaceOwnerId] = useState(currentUserId);
  const [connectedAccount, setConnectedAccount] = useState(null);
  const [connectionCheckError, setConnectionCheckError] = useState("");
  const [documentPage, setDocumentPage] = useState(
    () => documentsPagination.page || 1
  );
  const [activeLibrary, setActiveLibrary] = useState(null);
  const [openDocumentMenuId, setOpenDocumentMenuId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const fileInputRef = useRef(null);
  const selectionDialogRef = useRef(null);
  const previewDialogRef = useRef(null);
  const deleteDialogRef = useRef(null);
  const documentActionMenuRef = useRef(null);
  const documentActionTriggerRef = useRef(null);
  const retryActionRef = useRef(null);
  const documentPageRequestRef = useRef(0);
  const documentPageRef = useRef(documentPage);
  const activeDocumentPageRequestRef = useRef(null);
  const activeLibrariesRequestRef = useRef(null);
  const activeLibraryDocumentsRequestRef = useRef(null);
  const activeLibraryIdRef = useRef(null);
  const activePreviewRequestRef = useRef(null);
  const activeDownloadRequestRef = useRef(null);
  const previewRequestVersionRef = useRef(0);
  const downloadLockRef = useRef(false);
  const uploadLockRef = useRef(false);
  const uploadRequestRef = useRef(null);
  const checkedProcessingCyclesRef = useRef(new Set());
  const initialDocumentPageRef = useRef(documentPage);
  const [dashboardHistoryReady, setDashboardHistoryReady] = useState(false);
  const pendingLibraryIdRef = useRef(null);
  const isConnectedWorkspace = Boolean(
    workspaceOwnerId && workspaceOwnerId !== currentUserId
  );

  const requestDocumentPage = useCallback((page) => {
    const requestVersion = ++documentPageRequestRef.current;
    setDocumentPage(page);
    activeDocumentPageRequestRef.current?.abort();
    const request = dispatch(
      getDocuments({ page, limit: 20, ownerId: workspaceOwnerId })
    );
    activeDocumentPageRequestRef.current = request;
    request
      .then((action) => {
        if (
          requestVersion === documentPageRequestRef.current &&
          getDocuments.fulfilled.match(action)
        ) {
          setDocumentPage(action.payload?.pagination?.page || page);
        }
      })
      .catch(swallowAbortError);
    return request;
  }, [dispatch, workspaceOwnerId]);

  const requestDocumentLibraries = useCallback(() => {
    activeLibrariesRequestRef.current?.abort();
    const request = dispatch(getDocumentLibraries(workspaceOwnerId));
    request.catch(swallowAbortError);
    activeLibrariesRequestRef.current = request;
    return request;
  }, [dispatch, workspaceOwnerId]);

  const requestLibraryDocuments = useCallback((libraryId) => {
    activeLibraryDocumentsRequestRef.current?.abort();
    const request = dispatch(
      getLibraryDocuments({ libraryId, ownerId: workspaceOwnerId })
    );
    request.catch(swallowAbortError);
    activeLibraryDocumentsRequestRef.current = request;
    return request;
  }, [dispatch, workspaceOwnerId]);

  const refreshVisibleDocumentData = useCallback((documentId) => {
    void requestDocumentPage(documentPageRef.current);
    void requestDocumentLibraries()
      .then((action) => {
        if (!getDocumentLibraries.fulfilled.match(action)) return;
        const selectedLibraryId = activeLibraryIdRef.current;
        if (!selectedLibraryId) return;
        const refreshedLibrary = action.payload.find(
          (library) => String(library._id) === selectedLibraryId
        );
        if (!refreshedLibrary) {
          activeLibraryDocumentsRequestRef.current?.abort();
          setActiveLibrary(null);
          return;
        }
        setActiveLibrary(refreshedLibrary);
        void requestLibraryDocuments(refreshedLibrary._id);
      })
      .catch(swallowAbortError);
    if (documentId) {
      const documentRequest = dispatch(getDocumentById({ documentId, ownerId: workspaceOwnerId }));
      documentRequest.catch(swallowAbortError);
    }
  }, [
    dispatch,
    requestDocumentLibraries,
    requestDocumentPage,
    requestLibraryDocuments,
    workspaceOwnerId,
  ]);

  const pushDashboardViewHistory = useCallback((view, libraryId = null) => {
    window.history.pushState(
      {
        ...window.history.state,
        [DOCUMENT_VIEW_HISTORY_KEY]: {
          view,
          libraryId: libraryId ? String(libraryId) : null,
          page: documentPage,
        },
      },
      "",
      window.location.href
    );
  }, [documentPage]);

  useEffect(() => {
    let active = true;
    const savedView = window.history.state?.[DOCUMENT_VIEW_HISTORY_KEY];
    const restoredView = ["organize", "share", "messages"].includes(savedView?.view)
      ? savedView.view
      : "browse";
    const restoredPage =
      Number.isInteger(savedView?.page) && savedView.page > 0
        ? savedView.page
        : initialDocumentPageRef.current;
    initialDocumentPageRef.current = restoredPage;
    pendingLibraryIdRef.current = savedView?.libraryId
      ? String(savedView.libraryId)
      : null;

    window.history.replaceState(
      {
        ...window.history.state,
        [DOCUMENT_VIEW_HISTORY_KEY]: {
          view: restoredView,
          libraryId: savedView?.libraryId || null,
          page: restoredPage,
        },
      },
      "",
      window.location.href
    );

    window.queueMicrotask(() => {
      if (!active) return;
      setDashboardView(restoredView);
      setDocumentPage(restoredPage);
      setDashboardHistoryReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!dashboardHistoryReady) return;
    window.history.replaceState(
      {
        ...window.history.state,
        [DOCUMENT_VIEW_HISTORY_KEY]: {
          view: dashboardView,
          libraryId: activeLibrary?._id ? String(activeLibrary._id) : null,
          page: documentPage,
        },
      },
      "",
      window.location.href
    );
  }, [activeLibrary, dashboardHistoryReady, dashboardView, documentPage]);

  useEffect(() => {
    if (!currentUserId || dashboardView === "share") return undefined;
    let active = true;
    const clearConnectedWorkspace = () => {
      if (workspaceOwnerId === currentUserId) return;
      setWorkspaceOwnerId(currentUserId);
      setActiveLibrary(null);
      setDocumentPage(1);
      documentPageRef.current = 1;
      initialDocumentPageRef.current = 1;
      activeLibraryIdRef.current = null;
      pendingLibraryIdRef.current = null;
      dispatch(clearWorkspaceDocuments());
    };
    api.get("/api/auth/share/connection")
      .then((response) => {
        if (!active) return;
        setConnectionCheckError("");
        const connection = response.data?.data;
        if (
          connection?.connected === true &&
          connection.user?.id &&
          String(connection.user.id) !== currentUserId
        ) {
          if (connection.role === "viewer") {
            setConnectedAccount({
              id: String(connection.user.id),
              userName: connection.user.userName || "Connected account",
            });
          } else if (connection.role === "owner") {
            setConnectedAccount(null);
            clearConnectedWorkspace();
          } else {
            setConnectedAccount(null);
            setConnectionCheckError("We couldn't confirm your connected account.");
            clearConnectedWorkspace();
          }
        } else if (connection?.connected === false) {
          setConnectedAccount(null);
          clearConnectedWorkspace();
        } else {
          setConnectedAccount(null);
          setConnectionCheckError("We couldn't confirm your connected account.");
          clearConnectedWorkspace();
        }
      })
      .catch(() => {
        if (active) {
          setConnectedAccount(null);
          setConnectionCheckError("We couldn't check your connected account.");
          clearConnectedWorkspace();
        }
      });
    return () => {
      active = false;
    };
  }, [currentUserId, dashboardView, dispatch, workspaceOwnerId]);

  useEffect(() => {
    documentPageRef.current = documentPage;
  }, [documentPage]);

  useEffect(() => {
    activeLibraryIdRef.current = activeLibrary?._id
      ? String(activeLibrary._id)
      : null;
  }, [activeLibrary]);

  useEffect(() => {
    if (!user) return undefined;
    return subscribeToDocumentProcessingEvents({
      ownerId: workspaceOwnerId,
      onOpen: () => refreshVisibleDocumentData(),
      onEvent: (event) => {
        if (String(event.userId) === workspaceOwnerId) {
          refreshVisibleDocumentData(event.documentId);
        }
      },
    });
  }, [refreshVisibleDocumentData, user, workspaceOwnerId]);

  useEffect(() => {
    if (!pendingLibraryIdRef.current) return;
    const library = libraries.find(
      (item) => String(item._id) === pendingLibraryIdRef.current
    );
    if (!library) return;
    pendingLibraryIdRef.current = null;
    setActiveLibrary(library);
    void requestLibraryDocuments(library._id);
  }, [libraries, requestLibraryDocuments]);

  useEffect(() => {
    if (user) {
      const requestVersion = ++documentPageRequestRef.current;
      activeDocumentPageRequestRef.current?.abort();
      const documentsRequest = dispatch(
        getDocuments({
          page: initialDocumentPageRef.current,
          limit: 20,
          ownerId: workspaceOwnerId,
        })
      );
      activeDocumentPageRequestRef.current = documentsRequest;
      documentsRequest
        .then((action) => {
          if (
            requestVersion === documentPageRequestRef.current &&
            getDocuments.fulfilled.match(action)
          ) {
            setDocumentPage(
              action.payload?.pagination?.page || initialDocumentPageRef.current
            );
          }
        })
        .catch(swallowAbortError);
      return () => documentsRequest.abort();
    }
  }, [dispatch, user, workspaceOwnerId]);

  useEffect(() => {
    if (!user) return undefined;
    const librariesRequest = requestDocumentLibraries();
    librariesRequest.catch(swallowAbortError);
    return () => librariesRequest.abort();
  }, [requestDocumentLibraries, user]);

  useEffect(() => () => {
    previewRequestVersionRef.current += 1;
    activeDocumentPageRequestRef.current?.abort();
    activeLibrariesRequestRef.current?.abort();
    activeLibraryDocumentsRequestRef.current?.abort();
    activePreviewRequestRef.current?.abort();
    activeDownloadRequestRef.current?.abort();
  }, []);

  useEffect(() => {
    if (documentError?.status === 401) router.replace("/");
  }, [documentError, router]);

  const markProcessingCheck = useCallback((key) => {
    if (key) checkedProcessingCyclesRef.current.add(key);
  }, []);

  useEffect(() => {
    if (!user || documentDetailsTarget) return undefined;

    const processing = documents
      .filter((item) => ["queued", "processing"].includes(item.status))
      .map((item) => ({
        key: documentProcessingCheckKey(item),
        delay: documentProcessingCheckDelay(item),
      }))
      .filter(({ key }) => key);

    processing
      .filter(({ delay }) => delay === 0)
      .forEach(({ key }) => checkedProcessingCyclesRef.current.add(key));
    const pending = processing.filter(
      ({ key }) => !checkedProcessingCyclesRef.current.has(key)
    );

    if (!pending.length) return undefined;

    const nextDelay = Math.min(...pending.map(({ delay }) => delay));
    let request;
    const timer = window.setTimeout(() => {
      pending
        .filter(({ delay }) => delay <= nextDelay + 100)
        .forEach(({ key }) => checkedProcessingCyclesRef.current.add(key));
      request = requestDocumentPage(documentPageRef.current);
      void request.then((action) => {
        if (getDocuments.fulfilled.match(action)) {
          refreshVisibleDocumentData();
        }
      });
    }, nextDelay);

    return () => {
      window.clearTimeout(timer);
      request?.abort();
    };
  }, [
    dispatch,
    documentPage,
    documents,
    documentDetailsTarget,
    requestDocumentPage,
    refreshVisibleDocumentData,
    user,
  ]);

  useEffect(() => {
    if (!openDocumentMenuId) return undefined;
    const handlePointerDown = (event) => {
      if (!documentActionMenuRef.current?.contains(event.target)) {
        setOpenDocumentMenuId(null);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpenDocumentMenuId(null);
        documentActionTriggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openDocumentMenuId]);

  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (!previewDocument) return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [previewDocument]);

  useEffect(() => {
    if (!selectionPreviewUrl) return undefined;
    return () => URL.revokeObjectURL(selectionPreviewUrl);
  }, [selectionPreviewUrl]);

  useEffect(() => {
    if (!selectedFile) return undefined;
    selectionDialogRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !uploading) {
        setSelectedFile(null);
        setSelectionPreviewUrl("");
        setUploadProgress(0);
        setUploadValidationError("");
        setUploadSuccess(false);
        dispatch(clearDocumentError());
        if (fileInputRef.current) fileInputRef.current.value = "";
        document.getElementById("upload-document-button")?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dispatch, selectedFile, uploading]);

  useEffect(() => {
    if (!selectedFile) return undefined;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [selectedFile]);

  const handleFileChange = (event) => {
    const nextFile = event.target.files?.[0] || null;
    setUploadValidationError("");
    setSelectedFile(nextFile);
    setUploadProgress(0);
    setUploadSuccess(false);
    dispatch(clearDocumentError());
    dispatch(clearDocumentMessage());

    if (!nextFile) return;

    if (!ALLOWED_UPLOAD_TYPES.has(nextFile.type)) {
      setSelectedFile(null);
      setUploadValidationError("Choose a PDF, JPG, PNG, WebP, or GIF file.");
      event.target.value = "";
      return;
    }

    if (nextFile.size <= 0) {
      setSelectedFile(null);
      setUploadValidationError("This file is empty. Choose a non-empty document.");
      event.target.value = "";
      return;
    }

    if (nextFile.size > MAX_UPLOAD_SIZE) {
      setSelectedFile(null);
      setUploadValidationError("Choose a file smaller than 10 MB.");
      event.target.value = "";
      return;
    }

    if (nextFile) {
      if (nextFile.type.startsWith("image/")) {
        setSelectionPreviewUrl(URL.createObjectURL(nextFile));
      }
    }
  };

  const uploadSelectedFile = async () => {
    if (uploadLockRef.current || uploading) return;
    if (!selectedFile) {
      setUploadValidationError("Choose a document before uploading.");
      return;
    }

    uploadLockRef.current = true;
    setUploadSuccess(false);
    dispatch(clearDocumentError());
    dispatch(clearDocumentMessage());

    try {
      const request = dispatch(
        uploadDocument({
          file: selectedFile,
          onProgress: ({ percent }) => setUploadProgress(percent),
        })
      );
      uploadRequestRef.current = request;
      const result = await request;

      if (uploadDocument.fulfilled.match(result)) {
        retryActionRef.current = null;
        setUploadProgress(100);
        setUploadSuccess(true);
        void requestDocumentPage(1);
        setSelectedFile(null);
        setSelectionPreviewUrl("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        window.setTimeout(() => setUploadProgress(0), 1200);
      } else {
        retryActionRef.current = () => uploadSelectedFile();
      }
    } finally {
      uploadRequestRef.current = null;
      uploadLockRef.current = false;
    }
  };

  const handleUpload = (event) => {
    event.preventDefault();
    if (isConnectedWorkspace) return;
    return uploadSelectedFile();
  };

  const cancelFileSelection = () => {
    const cancellingUpload = uploadLockRef.current;
    if (cancellingUpload) {
      uploadRequestRef.current?.abort();
    }
    setSelectedFile(null);
    setSelectionPreviewUrl("");
    setUploadProgress(0);
    setUploadValidationError(cancellingUpload ? "Upload cancelled." : "");
    setUploadSuccess(false);
    dispatch(clearDocumentError());
    if (fileInputRef.current) fileInputRef.current.value = "";
    document.getElementById("upload-document-button")?.focus();
  };

  const pushOverlayHistory = useCallback((type, documentItem) => {
    window.history.pushState(
      {
        ...window.history.state,
        [DOCUMENT_OVERLAY_HISTORY_KEY]: {
          type,
          documentId: getDocumentId(documentItem),
        },
      },
      "",
      window.location.href
    );
  }, []);

  const closeOverlayLocally = useCallback((type) => {
    if (type === "preview") {
      previewRequestVersionRef.current += 1;
      activePreviewRequestRef.current?.abort();
      activePreviewRequestRef.current = null;
      setPreviewDocument(null);
      setPreviewUrl("");
      setPreviewLoading(false);
      setPreviewError("");
    } else if (type === "details") {
      setDocumentDetailsTarget(null);
    } else if (type === "delete") {
      setDeleteTarget(null);
    } else if (type === "properties") {
      setPropertiesTarget(null);
    }
  }, []);

  const closeOverlay = useCallback((type) => {
    if (
      window.history.state?.[DOCUMENT_OVERLAY_HISTORY_KEY]?.type === type
    ) {
      window.history.back();
      return;
    }
    closeOverlayLocally(type);
  }, [closeOverlayLocally]);

  const handlePreview = useCallback(async (documentItem, { addHistory = true } = {}) => {
    if (addHistory) pushOverlayHistory("preview", documentItem);
    activePreviewRequestRef.current?.abort();
    const requestVersion = ++previewRequestVersionRef.current;
    setPreviewDocument(documentItem);
    setPreviewUrl("");
    setPreviewError("");
    setPreviewLoading(true);

    let request;
    try {
      request = dispatch(fetchDocumentPreview({
        documentId: documentItem._id,
        ownerId: getDocumentOwnerId(documentItem),
      }));
      activePreviewRequestRef.current = request;
      const result = await request.unwrap();
      if (!result) return;
      if (requestVersion !== previewRequestVersionRef.current) {
        URL.revokeObjectURL(result);
        return;
      }

      retryActionRef.current = null;
      setPreviewUrl(result);
    } catch (error) {
      console.error("Preview failed:", error);
      if (requestVersion === previewRequestVersionRef.current) {
        setPreviewError(previewErrorMessage(error));
      }
    } finally {
      if (activePreviewRequestRef.current === request) {
        activePreviewRequestRef.current = null;
      }
      if (requestVersion === previewRequestVersionRef.current) {
        setPreviewLoading(false);
      }
    }
  }, [dispatch, pushOverlayHistory]);

  const handleDownload = async (documentItem) => {
    if (downloadLockRef.current) return;
    downloadLockRef.current = true;
    setDownloadPending(true);
    setDownloadError("");
    activeDownloadRequestRef.current?.abort();
    let objectUrl;
    let request;
    try {
      request = dispatch(downloadDocument({
        documentId: documentItem._id,
        ownerId: getDocumentOwnerId(documentItem),
      }));
      activeDownloadRequestRef.current = request;
      objectUrl = await request.unwrap();
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = documentItem.fileName || "document";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      retryActionRef.current = null;
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Download failed:", error);
        setDownloadError(
          "The download didn't start. Your document hasn't been changed. Check your connection and try again."
        );
        retryActionRef.current = () => handleDownload(documentItem);
      }
    } finally {
      if (activeDownloadRequestRef.current === request) {
        activeDownloadRequestRef.current = null;
      }
      downloadLockRef.current = false;
      setDownloadPending(false);
    }
  };

  const handlePrint = () => {
    if (!previewUrl) return;

    const printFrame = document.createElement("iframe");
    printFrame.title = "Document print preview";
    printFrame.setAttribute("aria-hidden", "true");
    printFrame.tabIndex = -1;
    printFrame.style.position = "fixed";
    printFrame.style.width = "100vw";
    printFrame.style.height = "100vh";
    printFrame.style.left = "-10000px";
    printFrame.style.top = "0";
    printFrame.style.border = "0";
    printFrame.onload = () => {
      const printWindow = printFrame.contentWindow;
      if (!printWindow) {
        console.error("Could not open the document print view.");
        printFrame.remove();
        return;
      }

      printWindow.addEventListener(
        "afterprint",
        () => printFrame.remove(),
        { once: true }
      );
      printWindow.focus();
      printWindow.print();
      window.setTimeout(() => printFrame.remove(), 60_000);
    };
    printFrame.onerror = () => {
      console.error("Could not load the document print view.");
      printFrame.remove();
    };
    printFrame.src = previewUrl;
    document.body.appendChild(printFrame);
  };

  const handleDelete = async () => {
    if (!deleteTarget || getDocumentOwnerId(deleteTarget) !== currentUserId) return;

    setIsDeleting(true);
    try {
      const result = await dispatch(deleteDocument(deleteTarget._id)).unwrap();
      if (result) {
        retryActionRef.current = null;
        closeOverlay("delete");
        refreshVisibleDocumentData();
      }
    } catch (error) {
      console.error("Delete failed:", error);
      setDeleteError(
        "We couldn't delete this document. It is still in your documents. Please try again."
      );
      retryActionRef.current = () => handleDelete();
    } finally {
      setIsDeleting(false);
    }
  };

  const openDocumentDetails = (documentItem) => {
    pushOverlayHistory("details", documentItem);
    setDocumentDetailsTarget(documentItem);
  };

  const closeDocumentDetails = () => {
    closeOverlay("details");
  };

  const openDeleteConfirmation = (documentItem) => {
    if (getDocumentOwnerId(documentItem) !== currentUserId) return;
    pushOverlayHistory("delete", documentItem);
    setDeleteError("");
    setDeleteTarget(documentItem);
  };

  const openDocumentProperties = (documentItem) => {
    pushOverlayHistory("properties", documentItem);
    setPropertiesTarget(documentItem);
  };

  useEffect(() => {
    const overlay = window.history.state?.[DOCUMENT_OVERLAY_HISTORY_KEY];
    if (!overlay) return;
    window.history.replaceState(
      { ...window.history.state, [DOCUMENT_OVERLAY_HISTORY_KEY]: null },
      "",
      window.location.href
    );
  }, []);

  useEffect(() => {
    const restoreOverlay = (event) => {
      const overlay = event.state?.[DOCUMENT_OVERLAY_HISTORY_KEY];
      const savedView = event.state?.[DOCUMENT_VIEW_HISTORY_KEY];
      if (["browse", "organize", "share", "messages"].includes(savedView?.view)) {
        setDashboardView(savedView.view);
        if (Number.isInteger(savedView.page) && savedView.page > 0) {
          setDocumentPage(savedView.page);
        }
        if (savedView.libraryId) {
          const library = libraries.find(
            (item) => String(item._id) === String(savedView.libraryId)
          );
          if (library) {
            setActiveLibrary(library);
            if (String(activeLibrary?._id) !== String(library._id)) {
              void requestLibraryDocuments(library._id);
            }
            pendingLibraryIdRef.current = null;
          } else {
            pendingLibraryIdRef.current = String(savedView.libraryId);
          }
        } else {
          pendingLibraryIdRef.current = null;
          activeLibraryDocumentsRequestRef.current?.abort();
          setActiveLibrary(null);
        }
      }
      const documentItem = overlay?.documentId
        ? [...documents, ...libraryDocuments].find(
            (item) => getDocumentId(item) === String(overlay.documentId)
          )
        : null;

      if (
        overlay?.type === "preview" &&
        previewDocument &&
        getDocumentId(previewDocument) === String(overlay.documentId)
      ) {
        setPropertiesTarget(null);
        return;
      }
      if (overlay?.type === "properties" && documentItem && previewDocument) {
        setPropertiesTarget(documentItem);
        return;
      }

      closeOverlayLocally("preview");
      closeOverlayLocally("details");
      closeOverlayLocally("delete");
      closeOverlayLocally("properties");
      if (!documentItem) return;
      if (
        overlay.type === "delete" &&
        getDocumentOwnerId(documentItem) !== currentUserId
      ) {
        return;
      }

      if (overlay.type === "preview") {
        void handlePreview(documentItem, { addHistory: false });
      } else if (overlay.type === "details") {
        setDocumentDetailsTarget(documentItem);
      } else if (overlay.type === "delete") {
        setDeleteTarget(documentItem);
      } else if (overlay.type === "properties") {
        setPropertiesTarget(documentItem);
      }
    };

    window.addEventListener("popstate", restoreOverlay);
    return () => window.removeEventListener("popstate", restoreOverlay);
  }, [
    documents,
    libraryDocuments,
    libraries,
    activeLibrary,
    currentUserId,
    requestLibraryDocuments,
    closeOverlayLocally,
    handlePreview,
    previewDocument,
  ]);

  useEffect(() => {
    if (propertiesTarget || (!previewDocument && !deleteTarget)) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (previewDocument) {
          closeOverlay("preview");
        } else if (deleteTarget) {
          closeOverlay("delete");
        }
      }
    };

    (previewDocument ? previewDialogRef : deleteDialogRef).current?.focus();
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewDocument, deleteTarget, propertiesTarget, closeOverlay]);

  const emptyDocumentState = documents.length === 0 && !documentsLoading;
  const peopleLibraries = libraries.filter(
    (library) => !["uncategorized", "unassigned"].includes(library.name?.trim().toLowerCase())
  );
  const visibleFileTypesByDocumentId = new Map(
    documents.map((item) => [getDocumentId(item), item.fileType])
  );
  const ownerByDocumentId = new Map();
  for (const library of libraries) {
    if (["uncategorized", "unassigned"].includes(library.name?.trim().toLowerCase())) continue;
    for (const item of library.documents || []) {
      const id = libraryDocumentId(item);
      const owners = ownerByDocumentId.get(id) || [];
      if (!owners.includes(library.name)) owners.push(library.name);
      ownerByDocumentId.set(id, owners);
    }
  }
  const uncategorizedLibrary = libraries.find((library) =>
    ["uncategorized", "unassigned"].includes(library.name?.trim().toLowerCase())
  );
  const activeLibraryName =
    activeLibrary &&
    ["uncategorized", "unassigned"].includes(activeLibrary.name?.trim().toLowerCase())
      ? "Needs a person"
      : activeLibrary?.name;
  const uncategorizedDocumentIds = new Set(
    (uncategorizedLibrary?.documents || []).map((documentItem) =>
      libraryDocumentId(documentItem)
    )
  );
  const unassignedDocuments = documents.filter(
    (documentItem) => uncategorizedDocumentIds.has(getDocumentId(documentItem))
  );
  const organizedDocuments = activeLibrary
    ? activeLibrary._id
      ? libraryDocuments
      : unassignedDocuments
    : [];

  const showDocumentLibrary = () => {
    if (dashboardView !== "organize" || activeLibrary) {
      pushDashboardViewHistory("organize");
    }
    activeLibraryDocumentsRequestRef.current?.abort();
    setDashboardView("organize");
    setActiveLibrary(null);
    void requestDocumentLibraries();
  };

  const selectWorkspaceOwner = (ownerId) => {
    if (!ownerId || ownerId === workspaceOwnerId) return;
    activeDocumentPageRequestRef.current?.abort();
    activeLibrariesRequestRef.current?.abort();
    activeLibraryDocumentsRequestRef.current?.abort();
    closeOverlayLocally("preview");
    closeOverlayLocally("details");
    closeOverlayLocally("properties");
    closeOverlayLocally("delete");
    setOpenDocumentMenuId(null);
    setActiveLibrary(null);
    setDocumentPage(1);
    documentPageRef.current = 1;
    initialDocumentPageRef.current = 1;
    activeLibraryIdRef.current = null;
    pendingLibraryIdRef.current = null;
    dispatch(clearWorkspaceDocuments());
    setWorkspaceOwnerId(ownerId);
  };

  const showShareWorkspace = () => {
    if (dashboardView !== "share" || activeLibrary) {
      pushDashboardViewHistory("share");
    }
    activeLibraryDocumentsRequestRef.current?.abort();
    setDashboardView("share");
    setActiveLibrary(null);
  };

  const showMessagesWorkspace = () => {
    if (dashboardView !== "messages" || activeLibrary) {
      pushDashboardViewHistory("messages");
    }
    activeLibraryDocumentsRequestRef.current?.abort();
    setDashboardView("messages");
    setActiveLibrary(null);
  };

  const showAllDocuments = () => {
    if (dashboardView !== "browse" || activeLibrary) {
      pushDashboardViewHistory("browse");
    }
    activeLibraryDocumentsRequestRef.current?.abort();
    setDashboardView("browse");
    setActiveLibrary(null);
  };

  const openLibrary = (library) => {
    if (String(activeLibrary?._id) === String(library?._id)) return;
    pushDashboardViewHistory("organize", library._id || null);
    setActiveLibrary(library);
    if (library._id) void requestLibraryDocuments(library._id);
  };

  if (isLoading && !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-slate-200 border-t-slate-900" />
          <p className="text-sm font-medium text-slate-500">Loading your dashboard…</p>
        </div>
      </main>
    );
  }

  if (!user) return null;

  return (
    <UserWorkspaceShell
      user={user}
      activeView={dashboardView}
      onAllDocuments={showAllDocuments}
      onLibrary={showDocumentLibrary}
      onShare={showShareWorkspace}
      onMessages={showMessagesWorkspace}
    >
      {dashboardView === "share" ? (
        <ShareWorkspace />
      ) : dashboardView === "messages" ? (
        <MessagesContent />
      ) : (
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <section aria-labelledby="documents-heading">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 id="documents-heading" className="text-2xl font-semibold tracking-tight text-[#0F172A] sm:text-3xl">
                {dashboardView === "organize"
                  ? "People & documents"
                  : isConnectedWorkspace && connectedAccount
                    ? `${connectedAccount.userName}'s documents`
                    : "Your documents"}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                {dashboardView === "organize" && activeLibrary ? (
                  <span className="font-medium text-slate-700">
                    {organizedDocuments.length} {organizedDocuments.length === 1 ? "document" : "documents"}
                  </span>
                ) : (
                  <>
                    <span className="font-medium text-slate-700">
                      {documentsPagination.total} {documentsPagination.total === 1 ? "document" : "documents"}
                    </span>
                    {dashboardView === "organize" ? " organized by person" : ""}
                  </>
                )}
              </p>
              {connectedAccount ? (
                <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Choose whose documents to view">
                  <button
                    type="button"
                    onClick={() => selectWorkspaceOwner(currentUserId)}
                    aria-pressed={!isConnectedWorkspace}
                    className={`min-h-10 rounded-lg border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${
                      !isConnectedWorkspace
                        ? "border-blue-200 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    My documents
                  </button>
                  <button
                    type="button"
                    onClick={() => selectWorkspaceOwner(connectedAccount.id)}
                    aria-pressed={isConnectedWorkspace}
                    className={`min-h-10 rounded-lg border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${
                      isConnectedWorkspace
                        ? "border-blue-200 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {connectedAccount.userName}&apos;s documents
                  </button>
                  {isConnectedWorkspace ? (
                    <span className="text-xs text-slate-500">
                      View and manage; upload and delete are unavailable.
                    </span>
                  ) : null}
                </div>
              ) : connectionCheckError ? (
                <p className="mt-3 text-sm text-slate-500" role="status">
                  {connectionCheckError}
                </p>
              ) : null}
            </div>
            {!isConnectedWorkspace ? (
              <>
                <input
                  ref={fileInputRef}
                  id="document-upload"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  onChange={handleFileChange}
                  disabled={uploading}
                  aria-label="Choose a document to upload"
                />
                <button
                  id="upload-document-button"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2878f0] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1e63d6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  <Upload size={16} />
                  {uploading ? "Uploading…" : "Upload document"}
                </button>
              </>
            ) : null}
          </div>

          {uploadValidationError && !selectedFile && (
            <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
              {uploadValidationError}
            </p>
          )}

          {uploadSuccess && (
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
              <Check size={16} className="mt-0.5 shrink-0" />
              <span>Document uploaded.</span>
            </div>
          )}

          {documentError && !selectedFile && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {documentError.message || "Something went wrong. Please try again."}
              <button
                type="button"
                onClick={() => {
                  const retry = retryActionRef.current;
                  retryActionRef.current = null;
                  dispatch(clearDocumentError());
                  if (retry) retry();
                    else requestDocumentPage(documentPage);
                }}
                className="min-h-10 rounded-full border border-rose-200 bg-white px-4 font-semibold text-rose-700 transition hover:bg-rose-100"
              >
                Try again
              </button>
            </div>
          )}

          <div id="documents" className="mt-5">
            {dashboardView === "organize" && !activeLibrary ? (
              <>
                {librariesLoading ? (
                  <div className="rounded-2xl bg-white px-4 py-10 text-center text-sm text-slate-500" role="status">
                    Loading your document library…
                  </div>
                ) : libraryError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700" role="alert">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>{libraryError.message || "We couldn’t load your document library."}</span>
                      <button
                        type="button"
                        onClick={() => requestDocumentLibraries()}
                        className="min-h-10 rounded-full border border-rose-200 bg-white px-4 font-semibold"
                      >
                        Try again
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {peopleLibraries.map((library) => {
                      const fileTypes = [...new Set(
                        (library.documents || [])
                          .map((item) => item?.fileType || visibleFileTypesByDocumentId.get(libraryDocumentId(item)))
                          .filter(Boolean)
                          .map((fileType) => getFileTypeMeta("", fileType).label)
                      )];
                      return (
                        <button
                          key={library._id}
                          type="button"
                          onClick={() => openLibrary(library)}
                          className="rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                        >
                          <span className="block truncate text-base font-semibold text-slate-900">
                            {library.name}
                          </span>
                          <span className="mt-1 block text-sm text-slate-600">
                            {(library.documents || []).length} {(library.documents || []).length === 1 ? "document" : "documents"}
                          </span>
                          <span className="mt-2 block truncate text-xs text-slate-400">
                            {fileTypes.length
                              ? fileTypes.join(" · ")
                              : "No file types yet"}
                          </span>
                        </button>
                      );
                    })}
                    {unassignedDocuments.length > 0 && (
                      <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                          <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                          Needs a person
                        </h2>
                        <span className="mt-1 block text-sm text-slate-500">
                          {unassignedDocuments.length} {unassignedDocuments.length === 1 ? "document" : "documents"}
                        </span>
                        <button
                          type="button"
                          onClick={() => openLibrary(uncategorizedLibrary)}
                          className="mt-2 inline-flex min-h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                        >
                          Assign
                        </button>
                      </section>
                    )}
                    {peopleLibraries.length === 0 && unassignedDocuments.length === 0 && (
                      <div className="col-span-full rounded-2xl bg-white px-5 py-12 text-center">
                        <h2 className="text-lg font-semibold text-slate-900">No library groups yet</h2>
                        <p className="mt-2 text-sm text-slate-500">
                          Processed documents will be organized here by the people identified in them.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : dashboardView === "organize" && activeLibrary ? (
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <button
                      type="button"
                      onClick={() => setActiveLibrary(null)}
                      className="mb-2 inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-500 transition hover:bg-white hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                    >
                      <ChevronRight size={15} className="rotate-180" />
                      People &amp; documents
                    </button>
                    <h2 className="text-lg font-semibold text-slate-900">{activeLibraryName}</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {activeLibrary._id
                        ? `${(activeLibrary.documents || []).length} documents`
                        : `${unassignedDocuments.length} documents`}
                    </p>
                  </div>
                </div>
                {activeLibrary._id && libraryDocumentsLoading ? (
                  <div className="rounded-2xl bg-white px-4 py-10 text-center text-sm text-slate-500" role="status">
                    Loading documents…
                  </div>
                ) : activeLibrary._id && libraryError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700" role="alert">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>{libraryError.message || "We couldn’t load these documents."}</span>
                      <button
                        type="button"
                        onClick={() => requestLibraryDocuments(activeLibrary._id)}
                        className="min-h-10 rounded-full border border-rose-200 bg-white px-4 font-semibold"
                      >
                        Try again
                      </button>
                    </div>
                  </div>
                ) : organizedDocuments.length === 0 ? (
                  <div className="rounded-2xl bg-white px-5 py-10 text-center text-sm text-slate-500">
                    No documents in this group yet.
                  </div>
                ) : (
                  <div className="space-y-3 sm:space-y-0 sm:divide-y sm:divide-slate-200 sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-white sm:px-5">
                    {organizedDocuments.map((documentItem) => {
                      const fileMeta = getFileTypeMeta(documentItem.fileName, documentItem.fileType);
                      const Icon = fileMeta.icon;
                      const documentId = getDocumentId(documentItem);
                      return (
                        <article
                          key={documentId}
                          className="relative flex gap-3 rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:bg-slate-50 sm:items-center sm:gap-3 sm:rounded-none sm:border-0 sm:px-1 sm:py-2.5"
                        >
                          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${fileMeta.accent}`}>
                            <Icon size={18} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-start justify-between gap-2">
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => openDocumentDetails(documentItem)}
                                  aria-label={`View details for ${getReadableDocumentName(documentItem)}`}
                                  className="block max-w-full truncate text-left text-sm font-semibold text-slate-900 hover:underline focus-visible:rounded-sm sm:text-[15px]"
                                >
                                  {getReadableDocumentName(documentItem)}
                                </button>
                                <p className="mt-1 truncate text-xs text-slate-500">
                                  {fileMeta.label} <span aria-hidden="true">·</span> {activeLibraryName}
                                </p>
                                <p className={`mt-1 truncate text-xs ${
                                  documentItem.status === "failed"
                                    ? "text-rose-700"
                                    : ["queued", "processing", "uploaded"].includes(documentItem.status)
                                      ? "text-amber-800"
                                      : "text-slate-500"
                                }`}>
                                  {documentStatusLabel(documentItem.status)}
                                </p>
                              </div>
                              <DocumentActionMenu
                                documentItem={documentItem}
                                canDelete={getDocumentOwnerId(documentItem) === currentUserId}
                                open={openDocumentMenuId === documentId}
                                menuRef={documentActionMenuRef}
                                triggerRef={documentActionTriggerRef}
                                onToggle={(event) => {
                                  documentActionTriggerRef.current = event.currentTarget;
                                  setOpenDocumentMenuId((current) => current === documentId ? null : documentId);
                                }}
                                onClose={() => setOpenDocumentMenuId(null)}
                                onPreview={() => void handlePreview(documentItem)}
                                onDownload={() => void handleDownload(documentItem)}
                                onDelete={() => openDeleteConfirmation(documentItem)}
                              />
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : documentsLoading && (
              documents.length === 0 || documentPage !== documentsPagination.page
            ) ? (
              <div className="rounded-2xl bg-white px-4 py-10 text-center text-sm text-slate-500" role="status">
                Loading your documents…
              </div>
            ) : emptyDocumentState && !documentError ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center">
                <h2 className="text-lg font-semibold text-slate-900">
                  {isConnectedWorkspace ? "No documents in this account" : "No documents yet"}
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  {isConnectedWorkspace
                    ? "There are no documents to show."
                    : "Upload your first document to get started."}
                </p>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-0 sm:divide-y sm:divide-slate-200 sm:rounded-2xl sm:border sm:border-slate-200 sm:bg-white sm:px-5">
                {documents.map((documentItem) => {
                  const fileMeta = getFileTypeMeta(documentItem.fileName, documentItem.fileType);
                  const Icon = fileMeta.icon;
                  const documentId = getDocumentId(documentItem);
                  const ownerNames = ownerByDocumentId.get(documentId) || [];

                  return (
                    <article
                      key={documentId}
                      className="relative flex gap-3 rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:bg-slate-50 sm:items-center sm:gap-3 sm:rounded-none sm:border-0 sm:px-1 sm:py-2.5"
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${fileMeta.accent}`}>
                        <Icon size={18} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => openDocumentDetails(documentItem)}
                              aria-label={`View details for ${getReadableDocumentName(documentItem)}`}
                              className="block max-w-full truncate text-left text-sm font-semibold text-slate-900 hover:underline focus-visible:rounded-sm sm:text-[15px]"
                            >
                              {getReadableDocumentName(documentItem)}
                            </button>
                            <p className="mt-1 truncate text-xs text-slate-500">
                              {fileMeta.label} <span aria-hidden="true">·</span> {ownerNames.length ? ownerNames.join(", ") : "Needs a person"}
                            </p>
                            <p className={`mt-1 truncate text-xs ${
                              documentItem.status === "failed"
                                ? "text-rose-700"
                                : ["queued", "processing", "uploaded"].includes(documentItem.status)
                                  ? "text-amber-800"
                                  : "text-slate-500"
                            }`}>
                              {documentStatusLabel(documentItem.status)}
                            </p>
                          </div>
                          <DocumentActionMenu
                            documentItem={documentItem}
                            canDelete={getDocumentOwnerId(documentItem) === currentUserId}
                            open={openDocumentMenuId === documentId}
                            menuRef={documentActionMenuRef}
                            triggerRef={documentActionTriggerRef}
                            onToggle={(event) => {
                              documentActionTriggerRef.current = event.currentTarget;
                              setOpenDocumentMenuId((current) => current === documentId ? null : documentId);
                            }}
                            onClose={() => setOpenDocumentMenuId(null)}
                            onPreview={() => void handlePreview(documentItem)}
                            onDownload={() => void handleDownload(documentItem)}
                            onDelete={() => openDeleteConfirmation(documentItem)}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {dashboardView === "browse" && documentsPagination.totalPages > 1 ? (
              <nav
                className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 sm:px-4"
                aria-label="Document pages"
              >
                <p className="text-sm text-slate-600">
                  Page {documentPage} of {documentsPagination.totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => requestDocumentPage(Math.max(1, documentPage - 1))}
                    disabled={documentsLoading || documentPage <= 1}
                    className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => requestDocumentPage(Math.min(documentsPagination.totalPages, documentPage + 1))}
                    disabled={documentsLoading || documentPage >= documentsPagination.totalPages}
                    className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </nav>
            ) : null}

          </div>
        </section>
      </div>
      )}

      {selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <section
            ref={selectionDialogRef}
            tabIndex={-1}
            onKeyDown={trapDialogFocus}
            className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-2xl outline-none sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="selected-upload-heading"
            aria-describedby="selected-upload-description"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="selected-upload-heading" className="text-xl font-semibold text-slate-900" tabIndex={-1}>
                  Ready to upload?
                </h2>
                <p id="selected-upload-description" className="mt-1 text-sm text-slate-500">
                  Check this is the right document.
                </p>
              </div>
              <button
                type="button"
                onClick={cancelFileSelection}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-700"
                aria-label={uploading ? "Cancel upload" : "Cancel file selection"}
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              {selectionPreviewUrl ? (
                <Image
                  src={selectionPreviewUrl}
                  alt={`Preview of ${selectedFile.name}`}
                  width={1000}
                  height={640}
                  unoptimized
                  className="max-h-64 w-full object-contain"
                />
              ) : (
                <div className="flex h-36 items-center justify-center text-slate-500">
                  <FileText size={44} strokeWidth={1.5} />
                </div>
              )}
            </div>
            <p className="mt-3 break-all text-sm font-medium text-slate-800">{selectedFile.name}</p>

            {uploading && (
              <div className="mt-4" role="status" aria-live="polite">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-700">Uploading…</span>
                  <span className="text-slate-500">{uploadProgress}%</span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-slate-200"
                  role="progressbar"
                  aria-label="Upload progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={uploadProgress}
                >
                  <div
                    className="h-full rounded-full bg-[#2878f0] transition-[width] duration-200"
                    style={{ width: `${Math.min(Math.max(uploadProgress, 0), 100)}%` }}
                  />
                </div>
              </div>
            )}

            {uploadValidationError && (
              <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
                {uploadValidationError}
              </p>
            )}
            {documentError && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-rose-50 px-3 py-3 text-sm text-rose-700" role="alert">
                <span>{documentError.message || "We couldn&apos;t upload this document."}</span>
                <button
                  type="button"
                  onClick={() => {
                    const retry = retryActionRef.current;
                    retryActionRef.current = null;
                    dispatch(clearDocumentError());
                    if (retry) retry();
                  }}
                  className="min-h-10 rounded-full border border-rose-200 bg-white px-4 font-semibold text-rose-700 transition hover:bg-rose-100"
                >
                  Try again
                </button>
              </div>
            )}

            <form onSubmit={handleUpload} className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={cancelFileSelection}
                disabled={uploading}
                className="min-h-12 rounded-full border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading}
                className="min-h-12 rounded-xl bg-[#2878f0] px-5 text-sm font-semibold text-white transition hover:bg-[#1e63d6] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploading ? "Uploading…" : "Upload Document"}
              </button>
            </form>
          </section>
        </div>
      )}

      {previewDocument && (
        <div className="fixed inset-0 z-50 flex h-dvh flex-col bg-slate-50" onClick={() => closeOverlay("preview")}>
          <div
            ref={previewDialogRef}
            tabIndex={-1}
            onKeyDown={trapDialogFocus}
            className="flex min-h-0 flex-1 flex-col outline-none"
            role="dialog"
            aria-modal="true"
            aria-labelledby="document-preview-heading"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 sm:px-5">
              <h2 id="document-preview-heading" className="min-w-0 truncate text-sm font-semibold text-slate-900 sm:text-base">
                {getReadableDocumentName(previewDocument)}
              </h2>
              <button
                type="button"
                onClick={() => closeOverlay("preview")}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2878f0]"
                aria-label="Close preview"
              >
                <X size={20} />
              </button>
            </header>

            <div id="document-preview-content" className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-100 p-2 sm:p-6">
              {previewLoading ? (
                <div className="text-center" role="status" aria-live="polite">
                  <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" />
                  <p className="mt-3 text-sm text-slate-600">Opening this document…</p>
                </div>
              ) : previewError ? (
                <div className="max-w-md rounded-xl bg-white px-5 py-5 text-center shadow-sm" role="alert">
                  <p className="text-sm leading-6 text-slate-700">{previewError}</p>
                  <button
                    type="button"
                    onClick={() => void handlePreview(previewDocument, { addHistory: false })}
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Try again
                  </button>
                </div>
              ) : isPreviewableDocument(previewDocument) && !previewUrl ? (
                <p className="rounded-xl bg-white px-5 py-4 text-center text-sm text-slate-600">
                  The preview is not available yet. You can still download the document.
                </p>
              ) : previewDocument.fileType?.startsWith("image/") || /\.(png|jpg|jpeg|webp|gif|heic|heif)$/i.test(previewDocument.fileName || "") ? (
                <Image
                  src={previewUrl}
                  alt={previewDocument.fileName || "Document"}
                  width={1600}
                  height={1600}
                  unoptimized
                  className="max-h-full w-auto max-w-full object-contain"
                />
              ) : previewDocument.fileType?.includes("pdf") || /\.pdf$/i.test(previewDocument.fileName || "") ? (
                <iframe
                  src={previewUrl}
                  title="Document content"
                  className="h-full min-h-[65vh] w-full max-w-5xl border-0 bg-white shadow-sm sm:min-h-0"
                />
              ) : (
                <p className="rounded-xl bg-white px-5 py-4 text-center text-sm text-slate-600 shadow-sm">
                  This file type cannot be displayed in the preview. You can download it to open it with a compatible app.
                </p>
              )}
            </div>

            <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
              {downloadError ? (
                <p className="mx-auto mb-3 max-w-xl rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
                  {downloadError}
                </p>
              ) : null}
              <div className={`mx-auto grid w-full max-w-xl gap-2 sm:gap-3 ${isPreviewableDocument(previewDocument) ? "grid-cols-3" : "grid-cols-2"}`}>
                <button
                  type="button"
                  onClick={() => void handleDownload(previewDocument)}
                  disabled={downloadPending}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#2878f0] px-2 text-xs font-semibold text-white transition hover:bg-[#1e63d6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2878f0] disabled:cursor-wait disabled:opacity-60 sm:text-sm"
                >
                  <Download size={17} aria-hidden="true" />
                  {downloadPending ? "Downloading…" : "Download"}
                </button>
                {isPreviewableDocument(previewDocument) ? (
                  <button
                    type="button"
                    onClick={handlePrint}
                    disabled={!previewUrl}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2878f0] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                  >
                    <Printer size={17} aria-hidden="true" />
                    Print
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => openDocumentProperties(previewDocument)}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2878f0] sm:text-sm"
                >
                  <Info size={17} aria-hidden="true" />
                  Properties
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div
            ref={deleteDialogRef}
            tabIndex={-1}
            onKeyDown={trapDialogFocus}
            className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl outline-none"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-document-heading"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                <Trash2 size={20} />
              </div>
              <div className="min-w-0">
                <h3 id="delete-document-heading" className="text-lg font-semibold text-slate-900">Delete this document?</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  This can’t be undone.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {deleteTarget.fileName || "Unnamed document"}
            </div>
            {deleteError ? (
              <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
                {deleteError}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => closeOverlay("delete")}
                className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="rounded-full bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      {documentDetailsTarget ? (
        <DocumentDetailsDialog
          documentItem={documentDetailsTarget}
          ownerId={getDocumentOwnerId(documentDetailsTarget)}
          onProcessingCheck={markProcessingCheck}
          onClose={closeDocumentDetails}
        />
      ) : null}
      {propertiesTarget ? (
        <DocumentPropertiesDialog
          documentItem={propertiesTarget}
          ownerId={getDocumentOwnerId(propertiesTarget)}
          ownerNames={ownerByDocumentId.get(getDocumentId(propertiesTarget)) || []}
          onClose={() => closeOverlay("properties")}
        />
      ) : null}
    </UserWorkspaceShell>
  );
}
