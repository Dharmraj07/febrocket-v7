"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  FileText,
  Files,
  Image as ImageIcon,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquareText,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { logoutUser, selectAuth } from "@/features/auth/authSlice";
import { api } from "@/lib/api";
import {
  clearAdminDashboardError,
  clearAdminDashboardMessage,
  clearSelectedAdminUser,
  deleteAdminUser,
  getAllUsers,
  getUserById,
  selectAdminDashboard,
  updateAdminUser,
} from "@/features/adminDashboard/adminDashboardSlice";
import {
  adminUploadDocument,
  clearAdminDocuments,
  clearAdminSelectedDocument,
  clearDocumentError,
  clearDocumentMessage,
  deleteAdminDocument,
  downloadAdminDocument,
  getAdminDocumentById,
  getAllDocumentsAdmin,
  getDocumentStats,
  previewAdminDocument,
  selectAdminDocumentLoading,
  selectAdminDocuments,
  selectAdminDocumentsLoading,
  selectAdminDocumentsPagination,
  selectAdminSelectedDocument,
  selectAdminStats,
  selectAdminStatsLoading,
  selectDocumentError,
  selectAdminDocumentUploading,
  setAdminSelectedDocument,
  retryDocumentProcessing,
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
import { subscribeToDocumentProcessingEvents } from "@/features/document/documentEvents";

const navigation = [
  { id: "users", label: "Users", icon: Users },
  { id: "documents", label: "Documents", icon: Files },
  { id: "messages", label: "Messages", icon: MessageSquareText },
];
const fileTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function idOf(value) {
  return String(value?._id || value?.id || value || "");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inclusiveDateEnd(value) {
  if (!value) return "";
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function safeError(error, fallback) {
  const status = error?.status || error?.payload?.status;
  const message =
    typeof error === "string"
      ? error
      : error?.message || error?.payload?.message || "";
  if (
    !message ||
    message.length > 240 ||
    /request failed|network error|timeout|axios|status code|stack|trace|exception|api.?key|token|mongo|redis|database|worker|https?:\/\/|access.?denied|\bECONN\w*|\bat\s+\S+\s+\(/i.test(message)
  ) {
    if (status === 401) return "Your session has expired. Sign in again.";
    if (status === 403) return "You do not have permission to do that.";
    if (status === 404) return "This document could not be found.";
    if (status === 409) return "This document is already being processed.";
    if (status === 413) return "The file is larger than the 10 MB limit.";
    if (status === 429) return "Too many requests. Please wait and try again.";
    if (status >= 500) return "The service is temporarily unavailable. Please try again.";
    return fallback;
  }
  return message;
}

function StatusPill({ value }) {
  const label = documentStatusLabel(value);
  const colors =
    value === "processed"
      ? "bg-green-50 text-green-700"
      : value === "failed"
        ? "bg-red-50 text-red-700"
        : value === "processing"
          ? "bg-slate-100 text-slate-700"
          : "bg-slate-100 text-slate-600";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${colors}`}>
      {label}
    </span>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="px-5 py-14 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <FileText size={20} />
      </div>
      <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</p>
    </div>
  );
}

function Pagination({ currentPage, totalPages, onPageChange }) {
  if (!totalPages || totalPages < 2) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <p className="text-sm text-slate-500">
        Page <span className="font-semibold text-slate-800">{currentPage}</span> of{" "}
        <span className="font-semibold text-slate-800">{totalPages}</span>
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={16} /> Previous
        </button>
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function TextField({ label, className = "", ...props }) {
  return (
    <label className={`block text-sm font-medium text-slate-700 ${className}`}>
      {label}
      <input
        {...props}
        className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { user: adminUser } = useSelector(selectAuth);
  const adminState = useSelector(selectAdminDashboard);
  const documents = useSelector(selectAdminDocuments);
  const documentPagination = useSelector(selectAdminDocumentsPagination);
  const selectedDocument = useSelector(selectAdminSelectedDocument);
  const selectedProcessingCheckKey = documentProcessingCheckKey(selectedDocument);
  const selectedProcessingCheckDelay = documentProcessingCheckDelay(selectedDocument);
  const stats = useSelector(selectAdminStats);
  const documentsLoading = useSelector(selectAdminDocumentsLoading);
  const adminDocumentLoading = useSelector(selectAdminDocumentLoading);
  const statsLoading = useSelector(selectAdminStatsLoading);
  const adminUploading = useSelector(selectAdminDocumentUploading);
  const documentError = useSelector(selectDocumentError);

  const [activeSection, setActiveSection] = useState("users");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavRef = useRef(null);
  const mobileNavTriggerRef = useRef(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userDocumentPage, setUserDocumentPage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const [userSearch, setUserSearch] = useState("");
  const [debouncedUserSearch, setDebouncedUserSearch] = useState("");
  const [documentPage, setDocumentPage] = useState(1);
  const [documentFilters, setDocumentFilters] = useState({
    q: "",
    status: "",
    fileType: "",
    from: "",
    to: "",
    userId: "",
  });
  const [debouncedDocumentName, setDebouncedDocumentName] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [editingExtractedData, setEditingExtractedData] = useState(null);
  const [documentDetailId, setDocumentDetailId] = useState("");
  const [previewTarget, setPreviewTarget] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [notice, setNotice] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [saving, setSaving] = useState(false);
  const [messageConversations, setMessageConversations] = useState([]);
  const [selectedMessageConversationId, setSelectedMessageConversationId] = useState("");
  const [messageThread, setMessageThread] = useState([]);
  const [messageReply, setMessageReply] = useState("");
  const [messageListState, setMessageListState] = useState("idle");
  const [messageListError, setMessageListError] = useState("");
  const [messageThreadError, setMessageThreadError] = useState("");
  const [messageReadError, setMessageReadError] = useState("");
  const [messageReplyError, setMessageReplyError] = useState("");
  const [messageListLoading, setMessageListLoading] = useState(false);
  const [messageThreadLoading, setMessageThreadLoading] = useState(false);
  const [messageSending, setMessageSending] = useState(false);
  const [messageThreadRetry, setMessageThreadRetry] = useState(0);
  const [mobileAdminThreadOpen, setMobileAdminThreadOpen] = useState(false);
  const selectedMessageConversationIdRef = useRef("");
  const messageListLoadedRef = useRef(false);
  const [downloadingId, setDownloadingId] = useState("");
  const [retryingId, setRetryingId] = useState("");
  const retryLock = useRef(new Set());
  const checkedProcessingCyclesRef = useRef(new Set());
  const adminUploadRequest = useRef(null);
  const adminDocumentDetailsRequest = useRef(null);
  const adminPreviewRequest = useRef(null);
  const adminDownloadRequest = useRef(null);
  const adminDownloadRequests = useRef(new Set());
  const adminPreviewRequestVersion = useRef(0);
  const adminUploadLock = useRef(false);
  const [deletingId, setDeletingId] = useState("");
  const {
    fileType: documentFileType,
    from: documentFrom,
    status: documentStatus,
    to: documentTo,
    userId: documentUserId,
  } = documentFilters;
  const adminName =
    adminUser?.userName || adminUser?.email?.split("@")[0] || "Admin";
  const selectedUser = adminState.selectedUser;
  const isViewingUser = activeSection === "users" && Boolean(selectedUserId);

  useEffect(() => {
    const request = dispatch(getDocumentStats());
    return () => {
      request.abort();
      dispatch(clearAdminDashboardMessage());
      dispatch(clearDocumentMessage());
    };
  }, [dispatch]);

  useEffect(() => {
    if (
      documentError?.status === 401 ||
      (typeof adminState.error === "object" && adminState.error?.status === 401)
    ) {
      router.replace("/");
    }
  }, [adminState.error, documentError, router]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedUserSearch(userSearch.trim());
      setUserPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [userSearch]);

  useEffect(() => {
    if (activeSection !== "users" || selectedUserId) return;
    const request = dispatch(
      getAllUsers({
        page: userPage,
        limit: 10,
        search: escapeRegex(debouncedUserSearch),
      })
    );
    return () => request.abort();
  }, [activeSection, debouncedUserSearch, dispatch, selectedUserId, userPage]);

  useEffect(() => {
    if (activeSection !== "users" || !selectedUserId) return;
    const userRequest = dispatch(getUserById(selectedUserId));
    const documentsRequest = dispatch(
      getAllDocumentsAdmin({
        page: userDocumentPage,
        limit: 20,
        userId: selectedUserId,
      })
    );
    return () => {
      userRequest.abort();
      documentsRequest.abort();
    };
  }, [activeSection, dispatch, selectedUserId, userDocumentPage]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedDocumentName(documentFilters.q.trim());
      setDocumentPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [documentFilters.q]);

  useEffect(() => {
    if (activeSection !== "documents") return;
    const request = dispatch(getAllUsers({ page: 1, limit: 50 }));
    return () => request.abort();
  }, [activeSection, dispatch]);

  useEffect(() => {
    if (activeSection !== "documents") return;
    const request = dispatch(
      getAllDocumentsAdmin({
        page: documentPage,
        limit: 20,
        userId: documentUserId,
        status: documentStatus,
        fileType: documentFileType,
        from: documentFrom,
        q: escapeRegex(debouncedDocumentName),
        to: inclusiveDateEnd(documentTo),
      })
    );
    return () => request.abort();
  }, [
    activeSection,
    debouncedDocumentName,
    dispatch,
    documentFileType,
    documentFrom,
    documentStatus,
    documentTo,
    documentUserId,
    documentPage,
  ]);

  const loadAdminConversations = useCallback(async () => {
    setMessageListLoading(true);
    setMessageListError("");
    if (!messageListLoadedRef.current) setMessageListState("loading");
    try {
      const response = await api.get("/api/messages/conversations", {
        params: { page: 1, limit: 100 },
      });
      const conversations = response?.data?.conversations;
      if (!Array.isArray(conversations)) {
        throw new Error("The conversations response was not a list.");
      }
      const getConversationUserId = (conversation) =>
        String(conversation?.userId?._id || conversation?.userId || "");
      const userIds = [
        ...new Set(
          conversations.map(getConversationUserId).filter(Boolean)
        ),
      ];
      let usersById = new Map();
      if (userIds.length) {
        const usersResponse = await api.get("/api/auth/admin/users", {
          params: { ids: userIds.join(","), limit: userIds.length },
        });
        const users = usersResponse?.data?.users;
        if (!Array.isArray(users)) {
          throw new Error("The users response was not a list.");
        }
        usersById = new Map(
          users.map((user) => [String(user?._id || user?.id || ""), user])
        );
      }
      const conversationsWithEmails = conversations.map((conversation) => {
        const userId = getConversationUserId(conversation);
        return {
          ...conversation,
          userEmail: usersById.get(userId)?.email || "",
        };
      });
      setMessageConversations(conversationsWithEmails);
      messageListLoadedRef.current = true;
      setMessageListState("ready");
      const currentId = selectedMessageConversationIdRef.current;
      const selectedConversation = conversationsWithEmails.find(
        (conversation) => String(conversation?._id || conversation?.id || "") === currentId
      );
      const nextId = selectedConversation
        ? currentId
        : String(conversationsWithEmails[0]?._id || conversationsWithEmails[0]?.id || "");
      selectedMessageConversationIdRef.current = nextId;
      setSelectedMessageConversationId(nextId);
      setMobileAdminThreadOpen(false);
      if (nextId !== currentId) {
        setMessageThread([]);
        setMessageThreadError("");
      }
    } catch (error) {
      const status = error?.response?.status;
      setMessageListError(
        status === 401
          ? "Your session may have expired. Sign in again, then retry."
          : status === 403
            ? "You do not have permission to view the support inbox."
            : "Could not load messages. Try again."
      );
      if (!messageListLoadedRef.current) setMessageListState("error");
    } finally {
      setMessageListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSection !== "messages") return undefined;
    void Promise.resolve().then(loadAdminConversations);
    return undefined;
  }, [activeSection, loadAdminConversations]);

  useEffect(() => {
    if (activeSection !== "messages" || !selectedMessageConversationId) return undefined;

    let ignore = false;
    void (async () => {
      setMessageThreadLoading(true);
      setMessageThreadError("");
      setMessageReadError("");
      try {
        const response = await api.get(`/api/messages/conversations/${selectedMessageConversationId}/messages`, {
          params: { page: 1, limit: 100 },
        });
        if (!Array.isArray(response?.data?.messages)) {
          throw new Error("The messages response was not a list.");
        }
        if (!ignore) {
          setMessageThread(response.data.messages);
          try {
            await api.patch(`/api/messages/conversations/${selectedMessageConversationId}/read`);
          } catch {
            if (!ignore) setMessageReadError("Messages could not be marked as read.");
          }
        }
      } catch {
        if (!ignore) {
          setMessageThreadError("Could not load this conversation. Try again.");
        }
      } finally {
        if (!ignore) {
          setMessageThreadLoading(false);
        }
      }
    })();

    return () => {
      ignore = true;
    };
  }, [activeSection, messageThreadRetry, selectedMessageConversationId]);

  useEffect(() => {
    if ((!isViewingUser && activeSection !== "documents") || documentDetailId) {
      return undefined;
    }

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

      if (isViewingUser && selectedUserId) {
        request = dispatch(
          getAllDocumentsAdmin({
            page: userDocumentPage,
            limit: 20,
            userId: selectedUserId,
          })
        );
      } else {
        request = dispatch(
          getAllDocumentsAdmin({
            page: documentPage,
            limit: 20,
            userId: documentUserId,
            status: documentStatus,
            fileType: documentFileType,
            from: documentFrom,
            q: escapeRegex(debouncedDocumentName),
            to: inclusiveDateEnd(documentTo),
          })
        );
      }
    }, nextDelay);

    return () => {
      window.clearTimeout(timer);
      request?.abort();
    };
  }, [
    activeSection,
    debouncedDocumentName,
    dispatch,
    documentFileType,
    documentFrom,
    documentPage,
    documentStatus,
    documentTo,
    documentUserId,
    documentDetailId,
    documents,
    isViewingUser,
    selectedUserId,
    userDocumentPage,
  ]);

  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (previewTarget) return undefined;
    adminPreviewRequestVersion.current += 1;
    adminPreviewRequest.current?.abort();
    adminPreviewRequest.current = null;
    return undefined;
  }, [previewTarget]);

  useEffect(() => {
    if (documentDetailId) return undefined;
    adminDocumentDetailsRequest.current?.abort();
    adminDocumentDetailsRequest.current = null;
    return undefined;
  }, [documentDetailId]);

  useEffect(() => () => {
    adminDocumentDetailsRequest.current?.abort();
    adminPreviewRequest.current?.abort();
    adminDownloadRequests.current.forEach((request) => request.abort());
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;

    const trigger = mobileNavTriggerRef.current;
    const navigationElement = mobileNavRef.current;
    navigationElement?.querySelector("button")?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
        trigger?.focus();
        return;
      }
      if (event.key !== "Tab" || !navigationElement) return;

      const focusable = navigationElement.querySelectorAll(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (
      !previewTarget &&
      !confirmation &&
      !editingUser &&
      !editingExtractedData &&
      !documentDetailId
    ) {
      return undefined;
    }
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setPreviewTarget(null);
        setPreviewUrl("");
        setConfirmation(null);
        setEditingUser(null);
        setEditingExtractedData(null);
        setDocumentDetailId("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    confirmation,
    documentDetailId,
    editingExtractedData,
    editingUser,
    previewTarget,
  ]);

  useEffect(() => {
    if (
      !documentDetailId ||
      !["queued", "processing"].includes(selectedDocument?.status)
    ) {
      return undefined;
    }

    const key = selectedProcessingCheckKey;
    if (!key || checkedProcessingCyclesRef.current.has(key)) return undefined;

    let request;
    const timer = window.setTimeout(() => {
      checkedProcessingCyclesRef.current.add(key);
      request = dispatch(getAdminDocumentById(documentDetailId));
    }, selectedProcessingCheckDelay);

    return () => {
      window.clearTimeout(timer);
      request?.abort();
    };
  }, [
    dispatch,
    documentDetailId,
    selectedProcessingCheckDelay,
    selectedProcessingCheckKey,
    selectedDocument?.status,
  ]);

  const userOptions = useMemo(
    () => adminState.users || [],
    [adminState.users]
  );

  const selectSection = (section) => {
    if (section !== activeSection) {
      dispatch(clearAdminSelectedDocument());
      setDocumentDetailId("");
    }
    setActiveSection(section);
    setMobileNavOpen(false);
    setNotice(null);
    dispatch(clearDocumentError());
    dispatch(clearAdminDashboardError());
  };

  const refreshCurrentDocuments = useCallback(() => {
    if (activeSection === "users") {
      if (selectedUserId) {
        void dispatch(
          getAllDocumentsAdmin({
            page: userDocumentPage,
            limit: 20,
            userId: selectedUserId,
          })
        );
      }
    } else {
      void dispatch(
        getAllDocumentsAdmin({
          page: documentPage,
          limit: 20,
          ...documentFilters,
          q: escapeRegex(debouncedDocumentName),
          to: inclusiveDateEnd(documentFilters.to),
        })
      );
    }
    void dispatch(getDocumentStats());
  }, [
    activeSection,
    debouncedDocumentName,
    dispatch,
    documentFilters,
    documentPage,
    selectedUserId,
    userDocumentPage,
  ]);

  useEffect(() => {
    if (!adminUser) return undefined;
    const refreshDocuments = () => refreshCurrentDocuments();
    return subscribeToDocumentProcessingEvents({
      onOpen: refreshDocuments,
      onEvent: (event) => {
        refreshDocuments();
        if (String(documentDetailId) === event.documentId) {
          void dispatch(getAdminDocumentById(event.documentId));
        }
      },
    });
  }, [
    activeSection,
    adminUser,
    debouncedDocumentName,
    dispatch,
    documentDetailId,
    documentFileType,
    documentFrom,
    documentPage,
    documentStatus,
    documentTo,
    documentUserId,
    refreshCurrentDocuments,
    selectedUserId,
    userDocumentPage,
  ]);

  const handleLogout = async () => {
    try {
      await dispatch(logoutUser()).unwrap();
    } catch (error) {
      setNotice({ type: "error", text: safeError(error, "Could not sign out.") });
    }
  };

  const handleUserOpen = (user) => {
    setSelectedUserId(idOf(user));
    setUserDocumentPage(1);
    dispatch(clearAdminDocuments());
    dispatch(clearAdminSelectedDocument());
    setDocumentDetailId("");
    setUploadFile(null);
    setUploadProgress(0);
    setUploadError("");
    setUploadSuccess("");
    setNotice(null);
  };

  const handleUserUpdate = async (event) => {
    event.preventDefault();
    if (!editingUser) return;
    setSaving(true);
    try {
      await dispatch(
        updateAdminUser({
          userId: idOf(editingUser),
          userData: {
            userName: editingUser.userName,
            email: editingUser.email,
            role: editingUser.role,
            isVerified: editingUser.isVerified,
          },
        })
      ).unwrap();
      setEditingUser(null);
      setNotice({ type: "success", text: "User details saved." });
    } catch (error) {
      setNotice({ type: "error", text: safeError(error, "Could not save user details.") });
    } finally {
      setSaving(false);
    }
  };

  const confirmUserDelete = (user) => {
    setConfirmation({
      title: "Delete this user?",
      description: `This permanently removes ${user.userName || user.email} and signs out their active sessions.`,
      confirmLabel: "Delete user",
      run: async () => {
        setSaving(true);
        try {
          await dispatch(deleteAdminUser(idOf(user))).unwrap();
          setSelectedUserId("");
          setNotice({ type: "success", text: "User deleted." });
        } catch (error) {
          setNotice({ type: "error", text: safeError(error, "Could not delete this user.") });
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (adminUploadLock.current || adminUploading) return;
    if (!selectedUser) return;
    if (!uploadFile) {
      setUploadError("Choose a document before uploading.");
      return;
    }
    if (!fileTypes.has(uploadFile.type)) {
      setUploadError("Choose a PDF, JPG, PNG, WebP, or GIF file.");
      return;
    }
    if (uploadFile.size <= 0) {
      setUploadError("This file is empty. Choose a non-empty document.");
      return;
    }
    if (uploadFile.size > 10 * 1024 * 1024) {
      setUploadError("The selected file is larger than the 10 MB limit.");
      return;
    }

    setUploadError("");
    setUploadSuccess("");
    setUploadProgress(0);
    adminUploadLock.current = true;
    try {
      const request = dispatch(
        adminUploadDocument({
          id: idOf(selectedUser),
          file: uploadFile,
          onProgress: (progress) => setUploadProgress(progress.percent),
        })
      );
      adminUploadRequest.current = request;
      const result = await request.unwrap();
      setUploadSuccess(result.message || "Document uploaded and queued.");
      setUploadFile(null);
      setUploadProgress(100);
    } catch (error) {
      setUploadError(
        error?.name === "AbortError"
          ? "Upload cancelled."
          : safeError(error, "Could not upload this document.")
      );
    } finally {
      adminUploadRequest.current = null;
      adminUploadLock.current = false;
    }
  };

  const cancelAdminUpload = () => {
    adminUploadRequest.current?.abort();
  };

  const handlePreview = async (record) => {
    adminPreviewRequest.current?.abort();
    const requestVersion = ++adminPreviewRequestVersion.current;
    setPreviewTarget(record);
    setPreviewUrl("");
    const request = dispatch(previewAdminDocument(idOf(record)));
    adminPreviewRequest.current = request;
    try {
      const url = await request.unwrap();
      if (requestVersion === adminPreviewRequestVersion.current) {
        setPreviewUrl(url);
      } else {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      if (error?.name !== "AbortError" && requestVersion === adminPreviewRequestVersion.current) {
        setPreviewTarget(null);
        setNotice({
          type: "error",
          text: safeError(error, "This document could not be previewed."),
        });
      }
    } finally {
      if (adminPreviewRequest.current === request) {
        adminPreviewRequest.current = null;
      }
    }
  };

  const handleDownload = async (record) => {
    const documentId = idOf(record);
    setDownloadingId(documentId);
    const request = dispatch(downloadAdminDocument(documentId));
    adminDownloadRequest.current = request;
    adminDownloadRequests.current.add(request);
    try {
      const url = await request.unwrap();
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = record.fileName || "document";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      if (error?.name !== "AbortError") {
        setNotice({
          type: "error",
          text: safeError(error, "Could not download this document."),
        });
      }
    } finally {
      adminDownloadRequests.current.delete(request);
      if (adminDownloadRequest.current === request) {
        adminDownloadRequest.current = null;
        setDownloadingId("");
      }
    }
  };

  const confirmDocumentDelete = (record) => {
    const documentId = idOf(record);
    setConfirmation({
      title: "Delete this document?",
      description: `${record.displayName || record.fileName || "This file"} and its extracted data will be permanently removed.`,
      confirmLabel: "Delete document",
      run: async () => {
        setDeletingId(documentId);
        try {
          await dispatch(deleteAdminDocument(documentId)).unwrap();
          setDocumentDetailId("");
          setNotice({ type: "success", text: "Document deleted." });
          refreshCurrentDocuments();
        } catch (error) {
          setNotice({ type: "error", text: safeError(error, "Could not delete this document.") });
        } finally {
          setDeletingId("");
        }
      },
    });
  };

  const openDocumentDetails = async (record) => {
    setDocumentDetailId(idOf(record));
    const pending = ["queued", "processing"].includes(record?.status);
    const key = documentProcessingCheckKey(record);
    const delay = pending ? documentProcessingCheckDelay(record) : 0;

    if (pending && delay > 0) {
      dispatch(setAdminSelectedDocument(record));
      return;
    }
    if (pending && key) checkedProcessingCyclesRef.current.add(key);

    const request = dispatch(getAdminDocumentById(idOf(record)));
    adminDocumentDetailsRequest.current = request;
    try {
      await request.unwrap();
    } catch (error) {
      if (error?.name !== "AbortError") {
        setDocumentDetailId("");
        setNotice({
          type: "error",
          text: safeError(error, "Could not load document details."),
        });
      }
    } finally {
      if (adminDocumentDetailsRequest.current === request) {
        adminDocumentDetailsRequest.current = null;
      }
    }
  };

  const startEditingExtractedData = (record) => {
    setEditingExtractedData({
      documentId: idOf(record),
      data:
        record?.data && typeof record.data === "object" && !Array.isArray(record.data)
          ? structuredClone(record.data)
          : {},
    });
  };

  const retryDocument = async (documentId) => {
    if (!documentId || retryLock.current.has(documentId)) return;
    retryLock.current.add(documentId);
    setRetryingId(documentId);
    try {
      await dispatch(
        retryDocumentProcessing({ documentId, admin: true })
      ).unwrap();
    } catch (error) {
      setNotice({
        type: "error",
        text: safeError(error, "Could not retry document processing."),
      });
      if (error?.status === 409 || error?.payload?.status === 409) {
        void dispatch(getAdminDocumentById(documentId));
      }
    } finally {
      retryLock.current.delete(documentId);
      setRetryingId("");
    }
  };

  const handleExtractedDataUpdate = async (event) => {
    event.preventDefault();
    if (!editingExtractedData) return;
    if (
      !editingExtractedData.data ||
      typeof editingExtractedData.data !== "object" ||
      Array.isArray(editingExtractedData.data)
    ) {
      setNotice({ type: "error", text: "Extracted fields must be a structured object." });
      return;
    }

    setSaving(true);
    try {
      await dispatch(
        updateDocumentExtractedData({
          documentId: editingExtractedData.documentId,
          data: editingExtractedData.data,
          admin: true,
        })
      ).unwrap();
      setEditingExtractedData(null);
      setNotice({ type: "success", text: "Extracted information saved." });
    } catch (error) {
      setNotice({ type: "error", text: safeError(error, "Could not save extracted information.") });
    } finally {
      setSaving(false);
    }
  };

  const confirmAction = async () => {
    const action = confirmation?.run;
    setConfirmation(null);
    if (action) await action();
  };

  const renderUserList = () => (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">User accounts</h2>
          <p className="mt-1 text-sm text-slate-500">
            Find an account to review its details and documents.
          </p>
        </div>
        <label className="relative block w-full sm:max-w-xs">
          <span className="sr-only">Search users by name or email</span>
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={userSearch}
            onChange={(event) => setUserSearch(event.target.value)}
            placeholder="Search name or email"
            className="min-h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        </label>
      </div>

      {adminState.isLoading && adminState.users.length ? (
        <p className="px-5 py-2 text-xs text-slate-500" role="status">
          Updating accounts…
        </p>
      ) : null}
      {adminState.error ? (
        <div className="flex items-start gap-3 px-5 py-8 text-sm text-red-700" role="alert">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p>{safeError(adminState.error, "Could not load user accounts.")}</p>
            <button
              type="button"
              onClick={() =>
                void dispatch(
                  getAllUsers({
                    page: userPage,
                    limit: 10,
                    search: debouncedUserSearch,
                  })
                )
              }
              className="mt-2 font-semibold underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        </div>
      ) : adminState.isLoading && !adminState.users.length ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500" role="status">
          Loading user accounts…
        </p>
      ) : !adminState.users.length ? (
        <EmptyState
          title={debouncedUserSearch ? "No matching users" : "No users yet"}
          description={
            debouncedUserSearch
              ? "Try a different name or email."
              : "New accounts will appear here."
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {adminState.users.map((user) => (
              <li
                key={idOf(user)}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                    <CircleUserRound size={19} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">
                      {user.userName || "Unnamed user"}
                    </p>
                    <p className="truncate text-sm text-slate-500">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-600">
                    {user.role || "user"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUserOpen(user)}
                    className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Manage
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            currentPage={adminState.pagination.currentPage}
            totalPages={adminState.pagination.totalPages}
            onPageChange={setUserPage}
          />
        </>
      )}
    </section>
  );

  const renderMessages = () => {
    const selectedConversation = messageConversations.find(
      (conversation) => String(conversation?._id || conversation?.id || "") === selectedMessageConversationId
    );

    const handleSendReply = async (event) => {
      event.preventDefault();
      const content = messageReply.trim();
      if (!selectedMessageConversationId || !content || messageSending) return;
      setMessageSending(true);
      setMessageReplyError("");
      try {
        const result = await api.post(
          `/api/messages/conversations/${selectedMessageConversationId}/messages`,
          { content }
        );
        const nextMessage = result?.data?.message;
        if (!nextMessage) throw new Error("The send message response was incomplete.");
        setMessageThread((current) => [...current, nextMessage]);
        setMessageConversations((current) =>
          current.map((conversation) => {
            const conversationId = String(conversation?._id || conversation?.id || "");
            if (conversationId !== selectedMessageConversationId) return conversation;
            return {
              ...conversation,
              lastMessagePreview: content.slice(0, 160),
              lastMessageAt: new Date().toISOString(),
            };
          })
        );
        setMessageReply("");
      } catch (error) {
        setMessageReplyError(error?.response?.data?.message || "Could not send reply. Try again.");
      } finally {
        setMessageSending(false);
      }
    };

    const selectAdminConversation = (conversation) => {
      const conversationId = String(conversation?._id || conversation?.id || "");
      if (conversationId === selectedMessageConversationId) {
        setMobileAdminThreadOpen(Boolean(conversation));
        return;
      }
      selectedMessageConversationIdRef.current = conversationId;
      setSelectedMessageConversationId(conversationId);
      setMobileAdminThreadOpen(Boolean(conversation));
      setMessageThread([]);
      setMessageReply("");
      setMessageThreadError("");
      setMessageReadError("");
      setMessageReplyError("");
    };

    return (
      <section className="overflow-hidden border-y border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Messages</h2>
          <button
            type="button"
            onClick={() => void loadAdminConversations()}
            disabled={messageListLoading}
            className="min-h-9 px-2 text-xs font-medium text-slate-500 hover:text-blue-700 disabled:opacity-60"
          >
            {messageListLoading && messageConversations.length ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {messageListError ? (
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm" role={messageConversations.length ? "status" : "alert"}>
            <span className={messageConversations.length ? "text-amber-800" : "text-red-700"}>
              {messageListError}
            </span>
            <button type="button" onClick={() => void loadAdminConversations()} className="font-semibold text-blue-700 hover:underline">
              Try again
            </button>
          </div>
        ) : null}

        {messageListState === "loading" ? (
          <p className="px-4 py-5 text-sm text-slate-500" role="status">Loading messages…</p>
        ) : messageListState === "error" ? null : !messageConversations.length ? (
          <div className="py-8 text-center">
            <MessageSquareText size={22} className="mx-auto text-slate-400" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-slate-700">No messages yet</p>
          </div>
        ) : (
          <div className="grid min-h-[min(70vh,680px)] lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className={`${mobileAdminThreadOpen ? "hidden" : ""} border-r border-slate-100 lg:block`}>
              <ul className="divide-y divide-slate-100">
                {messageConversations.map((conversation) => {
                  const conversationId = String(conversation?._id || conversation?.id || "");
                  const isActive = conversationId === selectedMessageConversationId;
                  return (
                    <li key={conversationId}>
                      <button
                        type="button"
                        onClick={() => selectAdminConversation(conversation)}
                        aria-current={isActive ? "true" : undefined}
                        className={`flex min-h-[72px] w-full items-center gap-3 px-3 py-3 text-left transition ${isActive ? "bg-slate-100" : "hover:bg-slate-50"}`}
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                          <CircleUserRound size={20} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium text-slate-900">{conversation.userEmail || "Unknown user"}</span>
                            <span className="shrink-0 text-[11px] text-slate-400">
                              {conversation.lastMessageAt ? formatDate(conversation.lastMessageAt) : ""}
                            </span>
                          </span>
                          <span className="mt-1 flex items-center justify-between gap-2">
                            <span className="truncate text-sm text-slate-500">{conversation.lastMessagePreview || "No messages yet."}</span>
                          {conversation.unreadCount > 0 ? (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Unread messages">
                            </span>
                          ) : null}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <div className={`${mobileAdminThreadOpen ? "flex" : "hidden lg:flex"} min-h-[460px] min-w-0 flex-col`}>
              {!selectedConversation ? (
                <div className="flex h-full min-h-[460px] flex-col items-center justify-center text-sm text-slate-500">
                  <MessageSquareText size={22} aria-hidden="true" />
                  <p className="mt-3 font-medium text-slate-700">Your messages</p>
                  <p className="mt-1">Choose a conversation to view the thread.</p>
                </div>
              ) : (
                <>
                  <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{selectedConversation.userEmail || "Unknown user"}</h3>
                      <p className="mt-0.5 text-xs text-slate-500">{selectedConversation.status === "closed" ? "Closed" : "User conversation"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectAdminConversation(null)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-600 hover:bg-slate-50 lg:hidden"
                    >
                      <ArrowLeft size={16} aria-hidden="true" /> Back
                    </button>
                  </div>

                  {messageThreadLoading ? <p className="px-4 py-3 text-sm text-slate-500" role="status">Loading messages…</p> : null}
                  {messageThreadError ? (
                    <p className="flex items-center gap-3 px-4 py-3 text-sm text-red-700" role="alert">
                      {messageThreadError}
                      <button type="button" onClick={() => setMessageThreadRetry((current) => current + 1)} className="font-semibold text-blue-700 hover:underline">Retry</button>
                    </p>
                  ) : null}
                  {messageReadError ? <p className="px-4 py-2 text-xs text-amber-800" role="status">{messageReadError}</p> : null}
                  <div className="flex max-h-[520px] min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
                    {!messageThreadLoading && !messageThreadError && messageThread.length ? (
                      messageThread.map((item) => {
                        const isUser = item.senderRole === "user";
                        return (
                          <div key={String(item._id || item.id || `${item.createdAt}-${item.content}`)} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
                            <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 ${isUser ? "bg-slate-100 text-slate-800" : "bg-blue-600 text-white"}`}>
                              <p className="text-sm leading-6">{item.content}</p>
                              <div className={`mt-1 text-[11px] ${isUser ? "text-slate-500" : "text-slate-300"}`}>
                                {formatDate(item.createdAt)}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : !messageThreadLoading && !messageThreadError ? <p className="py-8 text-center text-sm text-slate-500">No messages yet.</p> : null}
                  </div>

                  <form onSubmit={handleSendReply} className="sticky bottom-0 border-t border-slate-100 bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                    <label className="sr-only" htmlFor="admin-message-reply">Reply</label>
                    <div className="flex items-end gap-2">
                      <textarea
                        id="admin-message-reply"
                        value={messageReply}
                        onChange={(event) => setMessageReply(event.target.value)}
                        onKeyDown={(event) => {
                          if (
                            event.key !== "Enter" ||
                            event.shiftKey ||
                            event.nativeEvent.isComposing
                          ) {
                            return;
                          }
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }}
                        rows={1}
                        disabled={selectedConversation.status === "closed" || messageThreadLoading}
                        className="max-h-28 min-h-11 flex-1 resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-50"
                        placeholder={selectedConversation.status === "closed" ? "This conversation is closed." : "Write a reply... (Enter to send)"}
                        maxLength={5000}
                      />
                      <button
                        type="submit"
                        disabled={messageSending || !messageReply.trim() || selectedConversation.status === "closed"}
                        aria-label="Send reply"
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-300"
                      >
                        {messageSending ? <LoaderCircle size={18} className="animate-spin" /> : <MessageSquareText size={18} />}
                      </button>
                    </div>
                    {messageReplyError ? <p className="mt-2 text-xs text-red-700" role="alert">{messageReplyError}</p> : null}
                  </form>
                </>
              )}
            </div>
          </div>
        )}
      </section>
    );
  };

  const renderUserDetails = () => (
    <>
      <button
        type="button"
        onClick={() => {
          setSelectedUserId("");
          dispatch(clearSelectedAdminUser());
          dispatch(clearAdminDocuments());
          dispatch(clearAdminDashboardError());
          setUploadSuccess("");
          setUploadError("");
        }}
        className="mb-5 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900"
      >
        <ArrowLeft size={17} /> Back to users
      </button>

      {adminState.error ? (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {safeError(adminState.error, "Could not load this user.")}
        </div>
      ) : null}

      {!selectedUser ||
      idOf(selectedUser) !== selectedUserId ||
      adminState.isLoading ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500" role="status">
          Loading account…
        </p>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Account</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                  {selectedUser.userName || "Unnamed user"}
                </h2>
                <p className="mt-1 text-slate-600">{selectedUser.email}</p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium capitalize text-slate-700">
                    {selectedUser.role || "user"}
                  </span>
                  <span className={`rounded-full px-3 py-1.5 font-medium ${selectedUser.isVerified ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                    {selectedUser.isVerified ? "Email verified" : "Email not verified"}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditingUser({ ...selectedUser })}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Pencil size={16} /> Edit account
                </button>
                {idOf(selectedUser) !== idOf(adminUser) ? (
                  <button
                    type="button"
                    onClick={() => confirmUserDelete(selectedUser)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                  >
                    <Trash2 size={16} /> Delete user
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
              <h3 className="font-semibold text-slate-900">Documents</h3>
              <p className="mt-1 text-sm text-slate-500">
                Preview, download, or remove files linked to this account.
              </p>
            </div>
            {documentError ? (
              <p className="px-5 pt-4 text-sm text-red-700" role="alert">
                {safeError(documentError, "Could not load this user’s documents.")}
              </p>
            ) : null}
            {documentsLoading && documents.length ? (
              <p className="px-5 pt-3 text-xs text-slate-500" role="status">
                Updating documents…
              </p>
            ) : null}
            {documentsLoading && !documents.length ? (
              <p className="px-5 py-8 text-sm text-slate-500" role="status">Loading documents…</p>
            ) : documents.length ? (
              <>
                <DocumentRows
                  items={documents}
                  downloadingId={downloadingId}
                  deletingId={deletingId}
                  onPreview={handlePreview}
                  onDownload={handleDownload}
                  onDelete={confirmDocumentDelete}
                  onDetails={openDocumentDetails}
                />
                <Pagination
                  currentPage={documentPagination.page}
                  totalPages={documentPagination.totalPages}
                  onPageChange={setUserDocumentPage}
                />
              </>
            ) : (
              <EmptyState
                title="No documents"
                description="Files uploaded for this user will appear here."
              />
            )}
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <Upload size={19} />
              </span>
              <div>
                <h3 className="font-semibold text-slate-900">Upload for this user</h3>
                <p className="mt-1 text-sm text-slate-500">
                  The file will be added to the account shown below.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">
                {selectedUser.userName || "Unnamed user"}
              </p>
              <p className="mt-0.5 text-sm text-slate-600">{selectedUser.email}</p>
            </div>

            <form onSubmit={handleUpload} className="mt-4 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Select document
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/jpeg,image/png,image/webp,image/gif"
                  disabled={adminUploading}
                  onChange={(event) => {
                    setUploadFile(event.target.files?.[0] || null);
                    setUploadError("");
                    setUploadSuccess("");
                    setUploadProgress(0);
                  }}
                  className="mt-1.5 block min-h-11 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  PDF, JPG, PNG, WebP, or GIF · maximum 10 MB
                </span>
              </label>
              {uploadFile ? (
                <p className="text-sm text-slate-600">
                  Selected: <span className="font-medium text-slate-900">{uploadFile.name}</span>
                </p>
              ) : null}
              {uploadProgress > 0 && uploadProgress < 100 ? (
                <div>
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>Uploading</span><span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-slate-800 transition-[width]" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              ) : null}
              {uploadError ? <p className="text-sm text-red-700" role="alert">{uploadError}</p> : null}
              {uploadSuccess ? <p className="text-sm text-green-700" role="status">{uploadSuccess}</p> : null}
              <button
                type="submit"
                disabled={!uploadFile || adminUploading}
                className="min-h-11 rounded-lg bg-[#0F172A] px-4 text-sm font-semibold text-white transition hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {adminUploading ? "Uploading…" : "Upload document"}
              </button>
              {adminUploading ? (
                <button
                  type="button"
                  onClick={cancelAdminUpload}
                  className="ml-2 min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel upload
                </button>
              ) : null}
            </form>
          </section>
        </>
      )}
    </>
  );

  const renderDocuments = () => (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <h2 className="font-semibold text-slate-900">All documents</h2>
          <p className="mt-1 text-sm text-slate-500">
            Search and filter uploaded files. File contents stay private to this view.
          </p>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField
            label="Document name"
            value={documentFilters.q}
            onChange={(event) =>
              setDocumentFilters((current) => ({ ...current, q: event.target.value }))
            }
            placeholder="Search document names or filenames"
          />
          <label className="block text-sm font-medium text-slate-700">
            Status
            <select
              value={documentFilters.status}
              onChange={(event) => {
                setDocumentPage(1);
                setDocumentFilters((current) => ({ ...current, status: event.target.value }));
              }}
              className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            >
              <option value="">All statuses</option>
              {["uploaded", "queued", "processing", "processed", "failed"].map((status) => (
                <option key={status} value={status}>{documentStatusLabel(status)}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            File type
            <select
              value={documentFilters.fileType}
              onChange={(event) => {
                setDocumentPage(1);
                setDocumentFilters((current) => ({ ...current, fileType: event.target.value }));
              }}
              className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            >
              <option value="">All file types</option>
              <option value="application/pdf">PDF</option>
              <option value="image">Images</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            User
            <select
              value={documentFilters.userId}
              onChange={(event) => {
                setDocumentPage(1);
                setDocumentFilters((current) => ({ ...current, userId: event.target.value }));
              }}
              className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            >
              <option value="">All users</option>
              {userOptions.map((user) => (
                <option key={idOf(user)} value={idOf(user)}>
                  {user.userName || user.email}
                </option>
              ))}
            </select>
          </label>
          <TextField
            label="Uploaded from"
            type="date"
            value={documentFilters.from}
            onChange={(event) => {
              setDocumentPage(1);
              setDocumentFilters((current) => ({ ...current, from: event.target.value }));
            }}
          />
          <TextField
            label="Uploaded to"
            type="date"
            value={documentFilters.to}
            onChange={(event) => {
              setDocumentPage(1);
              setDocumentFilters((current) => ({ ...current, to: event.target.value }));
            }}
          />
        </div>
        {documentError ? (
          <p className="px-5 pb-4 text-sm text-red-700" role="alert">
            {safeError(documentError, "Could not load documents.")}
          </p>
        ) : documentsLoading && documents.length ? (
          <p className="px-5 pb-3 text-xs text-slate-500" role="status">
            Updating documents…
          </p>
        ) : null}
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {documentsLoading && !documents.length ? (
          <p className="px-5 py-12 text-center text-sm text-slate-500" role="status">Loading documents…</p>
        ) : documents.length ? (
          <>
            <DocumentRows
              items={documents}
              downloadingId={downloadingId}
              deletingId={deletingId}
              onPreview={handlePreview}
              onDownload={handleDownload}
              onDelete={confirmDocumentDelete}
              onDetails={openDocumentDetails}
            />
            <Pagination
              currentPage={documentPagination.page}
              totalPages={documentPagination.totalPages}
              onPageChange={setDocumentPage}
            />
          </>
        ) : (
          <EmptyState
            title="No documents found"
            description="Try changing the search or filters."
          />
        )}
      </section>
    </>
  );

  const statItems = [
    { label: "Documents", value: stats?.totalDocuments ?? (statsLoading ? "…" : "—") },
    { label: "Processing", value: stats?.byStatus?.processing ?? (statsLoading ? "…" : "—") },
    { label: "Needs attention", value: stats?.byStatus?.failed ?? (statsLoading ? "…" : "—") },
  ];

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileNavOpen}
              ref={mobileNavTriggerRef}
              onClick={() => setMobileNavOpen((open) => !open)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-50 lg:hidden"
            >
              {mobileNavOpen ? <X size={19} /> : <Menu size={19} />}
            </button>
            <Link href="/dashboard/admin" className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F172A] text-white">
                <ShieldCheck size={19} />
              </span>
              <span className="font-semibold tracking-tight">FebRocket Admin</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:block">{adminName}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <LogOut size={16} /><span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px]">
        <aside className="hidden min-h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-slate-200 bg-white p-4 lg:block">
          <p className="px-3 pb-3 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </p>
          <NavigationItems activeSection={activeSection} onSelect={selectSection} />
        </aside>

        {mobileNavOpen ? (
          <div className="fixed inset-0 top-16 z-20 bg-slate-950/30 lg:hidden" onClick={() => setMobileNavOpen(false)}>
            <nav
              ref={mobileNavRef}
              aria-label="Admin navigation"
              role="dialog"
              aria-modal="true"
              className="w-72 max-w-[85vw] border-r border-slate-200 bg-white p-4 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="px-3 pb-3 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Workspace</p>
              <NavigationItems activeSection={activeSection} onSelect={selectSection} />
            </nav>
          </div>
        ) : null}

        <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-medium text-slate-500">Administration</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                  {isViewingUser
                    ? selectedUser?.userName || "User account"
                    : activeSection === "users"
                      ? "Manage users"
                      : activeSection === "messages"
                        ? "Support inbox"
                        : "Manage documents"}
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-600">
                  {isViewingUser
                    ? selectedUser?.email || "Review this account and its documents."
                    : activeSection === "messages"
                      ? "Monitor and respond to user questions and support threads."
                      : "A clear view of the accounts and files that need your attention."}
                </p>
              </div>
              {!isViewingUser && activeSection !== "users" ? (
                <div className="flex flex-wrap gap-2">
                  {statItems.map((item) => (
                    <div key={item.label} className="min-w-28 rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-xs text-slate-500">{item.label}</p>
                      <p className="mt-0.5 font-semibold text-slate-900">{item.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {notice ? (
              <div
                className={`mb-5 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                  notice.type === "error"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-green-200 bg-green-50 text-green-800"
                }`}
                role={notice.type === "error" ? "alert" : "status"}
              >
                <span className="flex items-start gap-2">
                  {notice.type === "error" ? <AlertCircle size={17} className="mt-0.5 shrink-0" /> : <Check size={17} className="mt-0.5 shrink-0" />}
                  {notice.text}
                </span>
                <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">
                  <X size={17} />
                </button>
              </div>
            ) : null}

            {activeSection === "users"
              ? selectedUserId
                ? renderUserDetails()
                : renderUserList()
              : activeSection === "messages"
                ? renderMessages()
                : renderDocuments()}
          </div>
        </div>
      </div>

      {editingUser ? (
        <Modal title="Edit user account" onClose={() => setEditingUser(null)}>
          <form onSubmit={handleUserUpdate} className="space-y-4">
            <TextField
              label="Name"
              value={editingUser.userName || ""}
              minLength={3}
              maxLength={30}
              required
              onChange={(event) => setEditingUser({ ...editingUser, userName: event.target.value })}
            />
            <TextField
              label="Email address"
              type="email"
              value={editingUser.email || ""}
              required
              onChange={(event) => setEditingUser({ ...editingUser, email: event.target.value })}
            />
            <label className="block text-sm font-medium text-slate-700">
              Account type
              <select
                value={editingUser.role || "user"}
                onChange={(event) => setEditingUser({ ...editingUser, role: event.target.value })}
                className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              >
                {["user", "business", "admin"].map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(editingUser.isVerified)}
                onChange={(event) => setEditingUser({ ...editingUser, isVerified: event.target.checked })}
                className="h-4 w-4 accent-slate-900"
              />
              Email verified
            </label>
            {adminState.error ? <p className="text-sm text-red-700" role="alert">{safeError(adminState.error, "Could not save changes.")}</p> : null}
            <ModalActions
              onCancel={() => setEditingUser(null)}
              confirmLabel={saving ? "Saving…" : "Save changes"}
              disabled={saving}
            />
          </form>
        </Modal>
      ) : null}

      {documentDetailId ? (
        selectedDocument && idOf(selectedDocument) === documentDetailId ? (
          <Modal
            title={selectedDocument.displayName || selectedDocument.fileName || "Document details"}
            onClose={() => setDocumentDetailId("")}
            wide
          >
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
              <Detail label="Status"><StatusPill value={selectedDocument.status} /></Detail>
              <Detail label="Type">{selectedDocument.fileType || "Unknown"}</Detail>
              <Detail label="File size">{formatBytes(selectedDocument.fileSize)}</Detail>
              <Detail label="Uploaded">{formatDate(selectedDocument.createdAt)}</Detail>
              <Detail label="Last updated">{formatDate(selectedDocument.updatedAt)}</Detail>
            </dl>
            {selectedDocument.status === "failed" ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="font-semibold text-red-900">Processing failed</p>
                <p className="mt-1 text-sm text-red-800">
                  {safeProcessingError(selectedDocument.processingError)}
                </p>
                <button
                  type="button"
                  onClick={() => void retryDocument(documentDetailId)}
                  disabled={retryingId === documentDetailId}
                  className="mt-3 min-h-10 rounded-lg bg-[#0F172A] px-4 text-sm font-semibold text-white transition hover:bg-[#1E293B] disabled:opacity-50"
                >
                  {retryingId === documentDetailId ? "Retrying…" : "Retry"}
                </button>
              </div>
            ) : null}
            {["queued", "processing"].includes(selectedDocument.status) ? (
              <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700" role="status">
                {selectedDocument.status === "queued" ? "Waiting for processing." : "Processing…"}
                {" "}The latest status will be checked after the two-minute processing window.
              </p>
            ) : null}
            {selectedDocument.status === "processed" ? (
              <section className="mt-5 border-t border-slate-100 pt-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-slate-900">Extracted information</h3>
                  {selectedDocument.data &&
                  typeof selectedDocument.data === "object" &&
                  !Array.isArray(selectedDocument.data) &&
                  Object.keys(selectedDocument.data).length ? (
                    <button
                      type="button"
                      onClick={() => startEditingExtractedData(selectedDocument)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      <Pencil size={15} /> Edit
                    </button>
                  ) : null}
                </div>
                {hasExtractedData(selectedDocument?.data) ? (
                  <ExtractedDataViewer data={selectedDocument.data} />
                ) : (
                  <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    No extracted information is available for this document.
                  </p>
                )}
              </section>
            ) : null}
            {documentError ? (
              <p className="mt-4 text-sm text-red-700" role="alert">
                {safeError(documentError, "Could not load document details.")}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={downloadingId === documentDetailId}
                onClick={() => void handleDownload(selectedDocument)}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <ArrowDownToLine size={16} /> Download
              </button>
            </div>
          </Modal>
        ) : (
          <Modal title="Document details" onClose={() => setDocumentDetailId("")}>
            <p className="py-10 text-center text-sm text-slate-500" role="status">
              {adminDocumentLoading ? "Loading document details…" : "Document details are unavailable."}
            </p>
          </Modal>
        )
      ) : null}

      {editingExtractedData ? (
        <Modal
          title="Edit extracted information"
          onClose={() => setEditingExtractedData(null)}
          wide
        >
          <form onSubmit={handleExtractedDataUpdate} className="space-y-4">
            <ExtractedDataEditor
              data={editingExtractedData.data}
              onChange={(data) => setEditingExtractedData({ ...editingExtractedData, data })}
            />
            <ModalActions
              onCancel={() => setEditingExtractedData(null)}
              confirmLabel={saving ? "Saving…" : "Save information"}
              disabled={saving}
            />
          </form>
        </Modal>
      ) : null}

      {previewTarget ? (
        <Modal
          title={previewTarget.displayName || previewTarget.fileName || "Document preview"}
          onClose={() => {
            setPreviewTarget(null);
            setPreviewUrl("");
          }}
          wide
        >
          {previewUrl ? (
            previewTarget.fileType?.startsWith("image/") ? (
              <Image
                src={previewUrl}
                alt={previewTarget.displayName || previewTarget.fileName || "Document preview"}
                width={1600}
                height={1200}
                unoptimized
                className="mx-auto max-h-[70vh] max-w-full rounded-lg object-contain"
              />
            ) : (
              <iframe src={previewUrl} title={previewTarget.displayName || previewTarget.fileName || "Document preview"} className="h-[70vh] w-full rounded-lg border-0" />
            )
          ) : (
            <p className="py-16 text-center text-sm text-slate-500" role="status">Loading preview…</p>
          )}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void handleDownload(previewTarget)}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowDownToLine size={16} /> Download
            </button>
          </div>
        </Modal>
      ) : null}

      {confirmation ? (
        <Modal title={confirmation.title} onClose={() => setConfirmation(null)}>
          <p className="text-sm leading-6 text-slate-600">{confirmation.description}</p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmation(null)}
              className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || Boolean(deletingId)}
              onClick={() => void confirmAction()}
              className="min-h-11 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-50"
            >
              {deletingId ? "Deleting…" : confirmation.confirmLabel}
            </button>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

function NavigationItems({ activeSection, onSelect }) {
  return (
    <div className="space-y-1">
      {navigation.map(({ id, label, icon: Icon }) => (
        <button
          type="button"
          key={id}
          onClick={() => onSelect(id)}
          aria-current={activeSection === id ? "page" : undefined}
          className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition ${
            activeSection === id
              ? "bg-[#0F172A] text-white hover:bg-[#1E293B]"
              : "text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <Icon size={17} /> {label}
        </button>
      ))}
    </div>
  );
}

function DocumentRows({
  items,
  downloadingId,
  deletingId,
  onPreview,
  onDownload,
  onDelete,
  onDetails,
}) {
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((record) => {
        const recordId = idOf(record);
        const previewable =
          record.fileType === "application/pdf" || record.fileType?.startsWith("image/");
        return (
          <li key={recordId} className="flex flex-col gap-3 px-4 py-4 sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                {record.fileType?.startsWith("image/") ? <ImageIcon size={18} /> : <FileText size={18} />}
              </span>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onDetails(record)}
                  className="max-w-full truncate text-left font-semibold text-slate-900 hover:underline"
                >
                  {record.displayName || record.fileName || "Untitled document"}
                </button>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span>{formatBytes(record.fileSize)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatDate(record.createdAt)}</span>
                  <span aria-hidden="true">·</span>
                  <StatusPill value={record.status} />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pl-0 sm:pl-[52px]">
              <button
                type="button"
                disabled={!previewable}
                onClick={() => onPreview(record)}
                className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Preview
              </button>
              <button
                type="button"
                disabled={downloadingId === recordId}
                onClick={() => onDownload(record)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <ArrowDownToLine size={15} />
                {downloadingId === recordId ? "Preparing…" : "Download"}
              </button>
              <button
                type="button"
                disabled={deletingId === recordId}
                onClick={() => onDelete(record)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Modal({ title, onClose, wide = false, children }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = window.document.activeElement;
    dialog?.querySelector("button")?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  const trapFocus = (event) => {
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && window.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && window.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={dialogRef}
        onKeyDown={trapFocus}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6 ${
          wide ? "max-w-3xl" : "max-w-lg"
        }`}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function ModalActions({ onCancel, confirmLabel, disabled }) {
  return (
    <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
      <button
        type="button"
        onClick={onCancel}
        className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={disabled}
        className="min-h-11 rounded-lg bg-[#0F172A] px-4 text-sm font-semibold text-white transition hover:bg-[#1E293B] disabled:opacity-50"
      >
        {confirmLabel}
      </button>
    </div>
  );
}

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{children || "—"}</dd>
    </div>
  );
}
