"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Headphones,
  LoaderCircle,
  Send,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { selectAuth } from "@/features/auth/authSlice";
import UserWorkspaceShell from "@/features/dashboard/components/UserWorkspaceShell";
import { api, isAbortError } from "@/lib/api";

const getConversationId = (conversation) =>
  String(conversation?._id || conversation?.id || "");

const formatMessageTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const formatMessageDate = (value) => {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(date);
};

function InlineError({ children, onRetry }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm" role="alert">
      <span className="text-red-700">{children}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="font-semibold text-blue-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function MessagesContent() {
  const router = useRouter();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [listState, setListState] = useState("loading");
  const [listError, setListError] = useState("");
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState("");
  const [readError, setReadError] = useState("");
  const [replyError, setReplyError] = useState("");
  const [threadRetry, setThreadRetry] = useState(0);
  const [replyDraft, setReplyDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [readRetryIds, setReadRetryIds] = useState([]);
  const selectedConversationIdRef = useRef("");
  const listLoadedRef = useRef(false);
  const listRequestVersionRef = useRef(0);
  const listControllerRef = useRef(null);
  const threadRequestVersionRef = useRef(0);
  const threadControllerRef = useRef(null);
  const submittingRef = useRef(false);
  const latestMessageRef = useRef(null);
  const messageScrollRef = useRef(null);
  const messageElementsRef = useRef(new Map());
  const readInFlightRef = useRef(new Set());
  const activeConversationId = getConversationId(conversation);

  const loadConversation = useCallback(async () => {
    const requestVersion = ++listRequestVersionRef.current;
    listControllerRef.current?.abort();
    const controller = new AbortController();
    listControllerRef.current = controller;
    setListError("");
    if (!listLoadedRef.current) setListState("loading");

    try {
      const response = await api.get("/api/messages/conversations", {
        params: { page: 1, limit: 20 },
        signal: controller.signal,
      });
      const conversations = response?.data?.conversations;
      if (!Array.isArray(conversations)) {
        throw new Error("The conversations response was not a list.");
      }
      if (requestVersion !== listRequestVersionRef.current) return;

      const selectedId = selectedConversationIdRef.current;
      const existing = conversations.find(
        (item) => getConversationId(item) === selectedId
      );
      const nextConversation = existing || conversations[0] || null;
      selectedConversationIdRef.current = getConversationId(nextConversation);
      setConversation(nextConversation);
      setThreadRetry((current) => current + 1);
      listLoadedRef.current = true;
      setListState("ready");
      if (!nextConversation) setMessages([]);
    } catch (error) {
      if (isAbortError(error) || requestVersion !== listRequestVersionRef.current) return;
      const status = error?.response?.status;
      setListError(
        status === 401
          ? "Your session may have expired."
          : status === 403
            ? "You do not have permission to view these messages."
            : status >= 500
              ? "The messaging service is temporarily unavailable."
              : "Couldn’t load messages."
      );
      if (!listLoadedRef.current) setListState("error");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadConversation);
    return () => {
      listControllerRef.current?.abort();
    };
  }, [loadConversation]);

  useEffect(() => {
    const conversationId = activeConversationId;
    if (!conversationId) {
      threadControllerRef.current?.abort();
      ++threadRequestVersionRef.current;
      return;
    }

    const requestVersion = ++threadRequestVersionRef.current;
    threadControllerRef.current?.abort();
    const controller = new AbortController();
    threadControllerRef.current = controller;
    void (async () => {
      setThreadLoading(true);
      setThreadError("");
      setReadError("");
      try {
        const response = await api.get(
          `/api/messages/conversations/${activeConversationId}/messages`,
          { params: { page: 1, limit: 100 }, signal: controller.signal }
        );
        if (!Array.isArray(response?.data?.messages)) {
          throw new Error("The messages response was not a list.");
        }
        if (requestVersion !== threadRequestVersionRef.current) return;
        setMessages(response.data.messages);
      } catch (error) {
        if (!isAbortError(error) && requestVersion === threadRequestVersionRef.current) {
          setThreadError(
            error?.response?.status >= 500
              ? "The messaging service is temporarily unavailable."
              : "Couldn’t load messages."
          );
        }
      } finally {
        if (requestVersion === threadRequestVersionRef.current) setThreadLoading(false);
      }
    })();

    return () => controller.abort();
  }, [activeConversationId, threadRetry]);

  useEffect(() => {
    latestMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const markMessagesRead = useCallback(async (messageIds) => {
    if (!activeConversationId) return;
    const ids = [...new Set(messageIds)].filter(
      (id) => id && !readInFlightRef.current.has(id)
    );
    if (!ids.length) return;

    ids.forEach((id) => readInFlightRef.current.add(id));
    try {
      const response = await api.patch(
        `/api/messages/conversations/${activeConversationId}/read`,
        { messageIds: ids }
      );
      const confirmedIds = response?.data?.readMessageIds;
      if (!Array.isArray(confirmedIds)) {
        throw new Error("The read status response was incomplete.");
      }

      window.dispatchEvent(new Event("messages:unread-count-changed"));
      if (selectedConversationIdRef.current !== activeConversationId) return;
      const confirmed = new Set(confirmedIds);
      setMessages((current) =>
        current.map((message) =>
          confirmed.has(String(message._id || message.id))
            ? { ...message, readAt: response.data.readAt || new Date().toISOString() }
            : message
        )
      );
      setReadRetryIds((current) => current.filter((id) => !confirmed.has(id)));
      setReadError("");
    } catch (error) {
      if (selectedConversationIdRef.current === activeConversationId) {
        setReadRetryIds((current) => [...new Set([...current, ...ids])]);
        setReadError("Couldn’t update read status.");
      }
      console.warn("[Messages] Could not mark visible messages as read", {
        status: error?.response?.status || null,
        code: error?.code || null,
      });
    } finally {
      ids.forEach((id) => readInFlightRef.current.delete(id));
    }
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeConversationId || threadLoading || threadError || !messageScrollRef.current) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (document.visibilityState !== "visible") return;
        const visibleUnreadIds = entries
          .filter(
            (entry) =>
              entry.isIntersecting &&
              (entry.intersectionRatio >= 0.6 ||
                entry.intersectionRect.height >=
                  Math.min(80, entry.boundingClientRect.height * 0.6))
          )
          .map((entry) => entry.target.dataset.messageId)
          .filter(Boolean);
        if (visibleUnreadIds.length) void markMessagesRead(visibleUnreadIds);
      },
      { root: messageScrollRef.current, threshold: [0, 0.05, 0.1, 0.25, 0.6, 1] }
    );

    const observeUnreadMessages = () => {
      for (const message of messages) {
        if (message.senderRole !== "admin" || message.readAt) continue;
        const id = String(message._id || message.id || "");
        const element = messageElementsRef.current.get(id);
        if (id && element) {
          observer.unobserve(element);
          observer.observe(element);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") observeUnreadMessages();
    };

    observeUnreadMessages();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeConversationId, markMessagesRead, messages, threadError, threadLoading]);

  useEffect(() => {
    const refreshWhileVisible = () => {
      if (document.visibilityState === "visible") void loadConversation();
    };
    const intervalId = window.setInterval(refreshWhileVisible, 30000);
    document.addEventListener("visibilitychange", refreshWhileVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhileVisible);
    };
  }, [loadConversation]);

  const handleSendMessage = async (event) => {
    event.preventDefault();
    const conversationId = getConversationId(conversation);
    const content = replyDraft.trim();
    if (!content || submittingRef.current || conversation?.status === "closed") return;
    submittingRef.current = true;
    setSubmitting(true);
    setReplyError("");

    try {
      if (!conversationId) {
        const response = await api.post("/api/messages/conversations", { message: content });
        const createdConversation = response?.data?.conversation;
        const createdMessage = response?.data?.message;
        if (!createdConversation || !getConversationId(createdConversation) || !createdMessage) {
          throw new Error("The create conversation response was incomplete.");
        }
        selectedConversationIdRef.current = getConversationId(createdConversation);
        setConversation(createdConversation);
        setMessages([createdMessage]);
      } else {
        const response = await api.post(
          `/api/messages/conversations/${conversationId}/messages`,
          { content }
        );
        if (!response?.data?.message) throw new Error("The send message response was incomplete.");
        setMessages((current) => [...current, response.data.message]);
        setConversation((current) => ({
          ...current,
          lastMessageAt: response.data.message.createdAt || new Date().toISOString(),
          lastMessagePreview: content.slice(0, 160),
        }));
      }
      listLoadedRef.current = true;
      setListState("ready");
      setReplyDraft("");
    } catch (error) {
      setReplyDraft(content);
      setReplyError(error?.response?.data?.message || "Couldn’t send message. Try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const startNewConversation = () => {
    selectedConversationIdRef.current = "";
    setConversation(null);
    setMessages([]);
    setReplyDraft("");
    setReplyError("");
    setThreadError("");
    setReadError("");
    setReadRetryIds([]);
  };

  const dateLabel = (message) => {
    if (!message?.createdAt) return null;
    const date = new Date(message.createdAt);
    return Number.isNaN(date.getTime()) ? null : formatMessageDate(date);
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] min-h-[420px] max-h-[900px] max-w-[1200px] flex-col px-4 pb-4 pt-4 sm:px-6 lg:px-8">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-y border-slate-200 bg-white">
        {listState === "loading" ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500" role="status">
            <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
            Loading messages…
          </div>
        ) : listState === "error" ? (
          <div className="flex flex-1 items-center justify-center">
            <InlineError onRetry={() => void loadConversation()}>{listError}</InlineError>
          </div>
        ) : (
          <section className="flex min-h-0 flex-1 flex-col">
            <header className="flex min-h-[68px] items-center gap-3 border-b border-slate-100 px-4">
              <button
                type="button"
                onClick={() => router.push("/dashboard/user")}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 lg:hidden"
                aria-label="Back to dashboard"
              >
                <ArrowLeft size={20} aria-hidden="true" />
              </button>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                <Headphones size={20} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-sm font-semibold text-slate-900">FebRocket Support</h1>
                <p className="truncate text-xs text-slate-500">Support</p>
              </div>
              <button
                type="button"
                onClick={() => void loadConversation()}
                className="min-h-10 px-2 text-xs font-medium text-slate-500 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                aria-label="Refresh messages"
              >
                Refresh
              </button>
            </header>

            {listError ? <InlineError onRetry={() => void loadConversation()}>{listError}</InlineError> : null}
            {readError ? (
              <InlineError onRetry={() => void markMessagesRead(readRetryIds)}>
                {readError}
              </InlineError>
            ) : null}
            {threadError ? (
              <InlineError onRetry={() => setThreadRetry((current) => current + 1)}>
                {threadError}
              </InlineError>
            ) : null}

            <div
              ref={messageScrollRef}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-6"
            >
              {threadLoading ? (
                <p className="flex items-center justify-center gap-2 py-4 text-sm text-slate-500" role="status">
                  <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                  Loading messages…
                </p>
              ) : null}
              {!threadLoading && !threadError
                ? messages.map((message, index) => {
                    const isUser = message.senderRole === "user";
                    const messageId = String(message._id || message.id || "");
                    const currentDate = dateLabel(message);
                    const previousDate = dateLabel(messages[index - 1]);
                    return (
                      <div
                        key={messageId || message.createdAt || index}
                        data-message-id={messageId}
                        ref={(element) => {
                          if (messageId && element) {
                            messageElementsRef.current.set(messageId, element);
                          } else if (messageId) {
                            messageElementsRef.current.delete(messageId);
                          }
                        }}
                      >
                        {currentDate && currentDate !== previousDate ? (
                          <p className="my-3 text-center text-xs text-slate-400">{currentDate}</p>
                        ) : null}
                        <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                          <div className="max-w-[85%] sm:max-w-[75%]">
                            <p
                              className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-5 ${
                                isUser
                                  ? "rounded-br-md bg-blue-600 text-white"
                                  : "rounded-bl-md bg-slate-100 text-slate-800"
                              }`}
                            >
                              {message.content}
                            </p>
                            <p className={`mt-1 flex items-center gap-1 text-[11px] text-slate-400 ${isUser ? "justify-end" : ""}`}>
                              {formatMessageTime(message.createdAt)}
                              {isUser && message.readAt ? <span>· Seen</span> : null}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                : null}
              <div ref={latestMessageRef} />
            </div>

            {conversation?.status === "closed" ? (
              <div className="border-t border-slate-100 px-4 py-3 text-center">
                <p className="text-sm text-slate-500">This conversation is closed.</p>
                <button
                  type="button"
                  onClick={startNewConversation}
                  className="mt-1 text-sm font-semibold text-blue-700 hover:underline"
                >
                  Start a new conversation
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleSendMessage}
                className="border-t border-slate-100 bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-4"
              >
                {replyError ? (
                  <p className="mb-2 text-xs text-red-700" role="alert">{replyError}</p>
                ) : null}
                <div className="flex items-end gap-2">
                  <label className="sr-only" htmlFor="support-message-composer">Write a message</label>
                  <textarea
                    id="support-message-composer"
                    value={replyDraft}
                    onChange={(event) => setReplyDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    rows={1}
                    maxLength={5000}
                    placeholder={conversation ? "Write a message..." : "Message support..."}
                    className="max-h-32 min-h-11 flex-1 resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-100"
                  />
                  <button
                    type="submit"
                    disabled={submitting || !replyDraft.trim()}
                    aria-label="Send message"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200"
                  >
                    {submitting ? (
                      <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Send size={17} aria-hidden="true" />
                    )}
                  </button>
                </div>
                <p className="sr-only" aria-live="polite">
                  {submitting ? "Sending message" : ""}
                </p>
              </form>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export default function UserMessagesPage() {
  const { user } = useSelector(selectAuth);

  return (
    <UserWorkspaceShell user={user} activeView="messages">
      <MessagesContent />
    </UserWorkspaceShell>
  );
}
