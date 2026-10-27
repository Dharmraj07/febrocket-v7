const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 1000;
const MAX_ANSWERS_PER_SESSION = 100;
const MAX_FEEDBACK_PER_SESSION = 200;

const sessions = new Map();

function pruneExpired(now = Date.now()) {
  for (const [sessionId, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(sessionId);
  }
  while (sessions.size >= MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (!oldest) break;
    sessions.delete(oldest);
  }
}

function createSession({ sessionId, userId, libraryId, url, title }) {
  pruneExpired();
  const parsedUrl = new URL(url);
  const session = {
    sessionId,
    userId: String(userId),
    libraryId: String(libraryId),
    origin: parsedUrl.origin,
    path: parsedUrl.pathname.slice(0, 1024),
    title: String(title || "").slice(0, 200),
    answers: new Map(),
    feedback: [],
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  sessions.set(sessionId, session);
  return session;
}

function getSession({ sessionId, userId, libraryId, url }) {
  const now = Date.now();
  const session = sessions.get(sessionId);
  if (!session || session.expiresAt <= now) {
    if (session) sessions.delete(sessionId);
    return null;
  }
  if (session.userId !== String(userId) || session.libraryId !== String(libraryId)) return null;
  if (url && new URL(url).origin !== session.origin) return null;
  session.expiresAt = now + SESSION_TTL_MS;
  return session;
}

function resolveField({ session, fieldId, value }) {
  if (session.answers.size >= MAX_ANSWERS_PER_SESSION && !session.answers.has(fieldId)) {
    throw new Error("Form session has reached its answer limit.");
  }
  session.answers.set(fieldId, String(value).slice(0, 500));
}

function getAnswers(session) {
  return Object.fromEntries(session.answers);
}

function addFeedback({ session, results }) {
  for (const result of results) {
    session.feedback.push({
      fieldId: result.fieldId,
      status: result.status,
      createdAt: Date.now(),
    });
  }
  if (session.feedback.length > MAX_FEEDBACK_PER_SESSION) {
    session.feedback.splice(0, session.feedback.length - MAX_FEEDBACK_PER_SESSION);
  }
}

function clearForTests() {
  sessions.clear();
}

module.exports = {
  addFeedback,
  clearForTests,
  createSession,
  getAnswers,
  getSession,
  resolveField,
};
