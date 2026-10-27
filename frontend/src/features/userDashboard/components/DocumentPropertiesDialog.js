"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, FileText, HardDrive, UserRound, X } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { swallowAbortError } from "@/lib/api";
import {
  getDocumentById,
  selectDocumentError,
  selectSelectedDocument,
  selectSelectedDocumentLoading,
} from "@/features/document/documentSlice";
import { documentStatusLabel } from "@/features/document/documentPresentation";

function getDocumentId(documentItem) {
  return String(
    documentItem?._id ||
    documentItem?.id ||
    (typeof documentItem === "string" ? documentItem : "")
  );
}

function formatDate(date) {
  if (!date) return "Not available";
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return "Not available";
  return parsedDate.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Not available";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function Property({ label, value, icon: Icon }) {
  return (
    <div className="min-w-0 py-3">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 flex min-w-0 items-center gap-2 text-sm font-medium text-slate-800">
        {Icon ? <Icon size={15} className="shrink-0 text-slate-400" aria-hidden="true" /> : null}
        <span className="break-words">{value || "Not available"}</span>
      </dd>
    </div>
  );
}

export default function DocumentPropertiesDialog({
  documentItem,
  ownerId,
  ownerNames = [],
  onClose,
}) {
  const router = useRouter();
  const dispatch = useDispatch();
  const selectedDocument = useSelector(selectSelectedDocument);
  const loading = useSelector(selectSelectedDocumentLoading);
  const requestError = useSelector(selectDocumentError);
  const dialogRef = useRef(null);
  const documentId = getDocumentId(documentItem);
  const documentOwnerId = ownerId || getDocumentId(documentItem?.userId);
  const document =
    getDocumentId(selectedDocument) === documentId
      ? selectedDocument
      : documentItem;
  const extractedData = document?.data;
  const documentType =
    extractedData?.document?.documentType ||
    extractedData?.documentType ||
    extractedData?.type;

  useEffect(() => {
    const request = dispatch(getDocumentById({
      documentId,
      ownerId: documentOwnerId,
    }));
    request.catch(swallowAbortError);
    dialogRef.current?.focus();
    return () => request.abort();
  }, [dispatch, documentId, documentOwnerId]);

  useEffect(() => {
    if (requestError?.status === 401) router.replace("/");
  }, [requestError, router]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-properties-heading"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl outline-none sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <FileText size={19} />
            </span>
            <div className="min-w-0">
              <h2 id="document-properties-heading" className="text-lg font-semibold text-[#0F172A]">
                Properties
              </h2>
              <p className="mt-1 truncate text-sm text-slate-500">
                {document.displayName || document.fileName || "Document"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close document properties"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        {loading && getDocumentId(selectedDocument) !== documentId ? (
          <p className="mt-5 text-sm text-slate-500" role="status">
            Loading document properties…
          </p>
        ) : null}
        {requestError && getDocumentId(selectedDocument) !== documentId ? (
          <p className="mt-5 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
            {requestError.message || "Could not load document properties."}
          </p>
        ) : null}

        <section className="mt-5 border-t border-slate-100 pt-4" aria-labelledby="document-property-section">
          <h3 id="document-property-section" className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Document properties
          </h3>
          <dl className="grid gap-x-6 divide-y divide-slate-200 sm:grid-cols-2 sm:divide-y-0">
            <Property label="Display name" value={document.displayName || document.fileName} icon={FileText} />
            <Property label="Document type" value={documentType} />
            <Property label="Owner/person" value={ownerNames.length ? ownerNames.join(", ") : "Needs a person"} icon={UserRound} />
            <Property label="Status" value={documentStatusLabel(document.status)} />
            <Property label="Added date" value={formatDate(document.createdAt)} icon={CalendarDays} />
          </dl>
        </section>

        <section className="mt-5 border-t border-slate-100 pt-4" aria-labelledby="file-information-section">
          <h3 id="file-information-section" className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            File information
          </h3>
          <dl className="grid gap-x-6 divide-y divide-slate-200 sm:grid-cols-2 sm:divide-y-0">
            <Property label="Original filename" value={document.fileName} icon={FileText} />
            <Property label="File type" value={document.fileType} />
            <Property label="File size" value={formatFileSize(document.fileSize)} icon={HardDrive} />
          </dl>
        </section>
      </section>
    </div>
  );
}
