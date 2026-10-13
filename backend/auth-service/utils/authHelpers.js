// ============================================================
// IMPORTS
// ============================================================
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const createError = require("http-errors");
const jwt = require("jsonwebtoken");
const config = require("../config");
const { COOKIE_NAMES } = config;
const { setOtp, getOtp, deleteOtp } = require("./redisStore");


// ============================================================
// ERROR
// ============================================================
function AppError(message, statusCode = 500, errors) {
  return createError(statusCode, message, { errors });
}


// ============================================================
// GENERIC HELPERS
// ============================================================

/** Makes email comparison consistent (trim spaces, lowercase). */
const normalizeEmail = (email) => String(email).trim().toLowerCase();

/** Picks only safe, public fields from a user document. */
const publicUser = (user) => ({
  id: user._id,
  email: user.email,
  role: user.role,
  userName: user.userName,
  profilePicture: user.profilePicture || null,
  isVerified: user.isVerified,
});


// ============================================================
// PASSWORD HELPERS
// ============================================================

/** Hash a plain password using bcrypt (12 salt rounds). */
const hashPassword = async (password) => bcrypt.hash(password, 12);

/** Compare a plain password against a bcrypt hash. */
const comparePassword = (password, hash) => bcrypt.compare(password, hash);

/** Hash a token using SHA-256 (store hash, never raw token). */
const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");


// ============================================================
// JWT HELPERS
// ============================================================

/** Generate a short-lived ACCESS token. */
const accessToken = (user, sessionId) =>
  jwt.sign(
    {
      id: user._id,
      role: user.role,
      email: user.email,
      userName: user.userName,
      ...(sessionId ? { sid: sessionId } : {}),
    },
    config.jwtAccessSecret,
    { expiresIn: config.jwtAccessExpiry }
  );

/** Generate a long-lived REFRESH token with a unique jti. */
const refreshToken = (user) =>
  jwt.sign(
    {
      id: user._id,
      role: user.role,
      email: user.email,
      userName: user.userName,
      jti: crypto.randomUUID(),
      type: "refresh",
    },
    config.jwtRefreshSecret,
    { expiresIn: config.jwtRefreshExpiry }
  );

/** Build a session record to store inside the user document. */
const sessionRecord = (token, req) => {
  const payload = jwt.decode(token);
  const configuredExpiry = Date.now() + config.refreshSessionTtlMs;
  return {
    jti: payload.jti,
    tokenHash: hashToken(token),
    revokedAt: null,
    replacedByJti: null,
    expiresAt: new Date(Math.min(payload.exp * 1000, configuredExpiry)),
    createdAt: new Date(),
    userAgent: req.headers?.["user-agent"] || "",
    ipAddress: req.ip || req.headers?.["x-forwarded-for"] || "",
  };
};


// ============================================================
// COOKIE HELPERS
// ============================================================

const cookieBase = () => ({
  httpOnly: true,
  sameSite: config.cookieSameSite,
  secure: config.cookieSecure,
  path: "/",
});

/** Set extension-only cookies without changing website cookie behavior. */
const setExtensionCookies = (res, access, refresh) => {
  res.cookie(COOKIE_NAMES.EXTENSION_ACCESS, access, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/api/auth/me",
    maxAge: config.accessCookieMaxAge,
  });
  res.cookie(COOKIE_NAMES.EXTENSION_REFRESH, refresh, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/api/auth/refresh",
    maxAge: config.refreshCookieMaxAge,
  });
};

/** Set website and extension cookies for the same server-managed session. */
const setCookies = (res, access, refresh) => {
  const base = cookieBase();
  res.cookie(COOKIE_NAMES.ACCESS, access, {
    ...base,
    maxAge: config.accessCookieMaxAge,
  });
  res.cookie(COOKIE_NAMES.REFRESH, refresh, {
    ...base,
    maxAge: config.refreshCookieMaxAge,
  });
  setExtensionCookies(res, access, refresh);
};

/** Clear both auth cookies (used on logout). */
const clearCookies = (res) => {
  const base = cookieBase();
  res.clearCookie(COOKIE_NAMES.ACCESS, base);
  res.clearCookie(COOKIE_NAMES.REFRESH, base);
  res.clearCookie(COOKIE_NAMES.EXTENSION_ACCESS, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/api/auth/me",
  });
  res.clearCookie(COOKIE_NAMES.EXTENSION_REFRESH, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/api/auth/refresh",
  });
};


// ============================================================
// OTP HELPERS
// ============================================================

/** Generate a 6-digit OTP with an expiry. */
const generateOtp = () => ({
  value: crypto.randomInt(100000, 999999).toString(),
  expiresAt: new Date(Date.now() + config.otpTtlMs),
});

/** Hash OTP, save to user, return raw value (to email). */
const saveOtp = async (user) => {
  const otp = generateOtp();
  const hash = await hashPassword(otp.value);
  await setOtp(normalizeEmail(user.email), hash, config.otpTtlMs);
  user.otp = hash;
  user.otpExpires = otp.expiresAt;
  await user.save();
  return otp.value;
};

/** Verify an OTP. */
const verifyOtp = async (user, otp) => {
  if (!user?.otpExpires || user.otpExpires <= new Date()) return false;

  const cachedOtp = await getOtp(normalizeEmail(user.email));
  if (typeof cachedOtp === "string") {
    return bcrypt.compare(otp, cachedOtp);
  }

  if (!user.otp) return false;
  return bcrypt.compare(otp, user.otp);
};

const clearOtp = (user) => {
  if (!user?.email) return Promise.resolve(undefined);
  return deleteOtp(normalizeEmail(user.email));
};


// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  AppError,
  normalizeEmail,
  publicUser,
  hashPassword,
  comparePassword,
  hashToken,
  accessToken,
  refreshToken,
  sessionRecord,
  setCookies,
  setExtensionCookies,
  clearCookies,
  generateOtp,
  saveOtp,
  verifyOtp,
  clearOtp,
};