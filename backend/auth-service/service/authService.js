// ============================================================
// IMPORTS
// ============================================================
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const config = require("../config");
const User = require("../models/User");
const { getGoogleProfilePictureUrl } = require("../utils/profilePicture");
const { sendOtpEmail, sendVerificationOtpEmail } = require("../utils/email");

const {
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
  clearCookies,
  saveOtp,
  verifyOtp,
  clearOtp,
} = require("../utils/authHelpers");
const {
  getSessionState,
  setSessionState,
  invalidateUserCache,
} = require("../utils/redisStore");

const remainingSessionTtl = (expiresAt) =>
  Math.max(0, new Date(expiresAt).getTime() - Date.now());

const pruneExpiredSessions = (sessions, now = new Date()) =>
  (sessions || []).filter((session) => new Date(session.expiresAt) > now);


// ============================================================
// SESSION ISSUE
// ============================================================
const issueSession = async (user, req, res) => {
  const refresh = refreshToken(user);
  const record = sessionRecord(refresh, req);

  // Clean up expired sessions
  user.refreshSessions = pruneExpiredSessions(user.refreshSessions);

  user.refreshSessions.push(record);
  await user.save();

  await setSessionState(record.jti, "active", remainingSessionTtl(record.expiresAt));
  const access = accessToken(user, record.jti);
  setCookies(res, access, refresh);
  return publicUser(user);
};


// ============================================================
// REGISTER
// ============================================================
const registerUser = async ({ userName, email, password }) => {
  email = normalizeEmail(email);

  const exists = await User.exists({ $or: [{ email }, { userName }] });
  if (exists) {
    throw new AppError(
      "User already exists with the same email or username",
      400
    );
  }

  const user = await new User({
    userName,
    email,
    password: await hashPassword(password),
  }).save();

  const otp = await saveOtp(user);

  try {
    await sendVerificationOtpEmail(email, otp);
  } catch (error) {
    console.error("Verification email failed", error);
  }

  return user;
};


// ============================================================
// LOCAL AUTH
// ============================================================
const authenticateLocal = async (email, password) => {
  const user = await User.findOne({ email: normalizeEmail(email) }).select(
    "+password"
  );

  if (!user) throw new AppError("Incorrect email or password", 401);

  const ok = await comparePassword(password, user.password);
  if (!ok) throw new AppError("Incorrect email or password", 401);

  return user;
};


// ============================================================
// REFRESH
// ============================================================
const refreshSession = async (rawToken, req, res) => {
  if (!rawToken) throw new AppError("Refresh token missing.", 401);

  let payload;
  try {
    payload = jwt.verify(rawToken, config.jwtRefreshSecret);
  } catch (_error) {
    throw new AppError("Session expired. Please log in again.", 401);
  }

  if (payload.type !== "refresh" || !payload.id || !payload.jti) {
    throw new AppError("Session expired. Please log in again.", 401);
  }

  const tokenHash = hashToken(rawToken);
  const redisState = await getSessionState(payload.jti);
  if (redisState === "revoked") {
    throw new AppError("Session expired. Please log in again.", 401);
  }

  const user = await User.findOne({
    _id: payload.id,
    refreshSessions: {
      $elemMatch: {
        jti: payload.jti,
        tokenHash,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      },
    },
  });

  if (!user) throw new AppError("Session expired. Please log in again.", 401);

  const current = user.refreshSessions.find(
    (item) => item.jti === payload.jti && item.tokenHash === tokenHash
  );

  const nextToken = refreshToken(user);
  const nextRecord = sessionRecord(nextToken, req);

  current.revokedAt = new Date();
  current.replacedByJti = nextRecord.jti;
  user.refreshSessions.push(nextRecord);

  // Prune expired and stale revoked sessions to prevent unbounded BSON document bloat
  const now = new Date();
  const revokedRetentionCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  user.refreshSessions = (user.refreshSessions || []).filter(
    (s) =>
      new Date(s.expiresAt) > now &&
      (!s.revokedAt || new Date(s.revokedAt) > revokedRetentionCutoff)
  );
  if (user.refreshSessions.length > 50) {
    user.refreshSessions = user.refreshSessions.slice(-50);
  }

  await user.save();

  await Promise.all([
    setSessionState(
      current.jti,
      "revoked",
      remainingSessionTtl(current.expiresAt)
    ),
    setSessionState(
      nextRecord.jti,
      "active",
      remainingSessionTtl(nextRecord.expiresAt)
    ),
  ]);

  setCookies(res, accessToken(user, nextRecord.jti), nextToken);
};


// ============================================================
// LOGOUT
// ============================================================
const logout = async (rawToken, res) => {
  if (rawToken) {
    const payload = jwt.decode(rawToken);
    if (payload?.id && payload?.jti) {
      const user = await User.findById(payload.id);
      const session = user?.refreshSessions.find(
        (item) =>
          item.jti === payload.jti && item.tokenHash === hashToken(rawToken)
      );

      if (session) {
        session.revokedAt = new Date();
        await user.save();
        await setSessionState(
          session.jti,
          "revoked",
          remainingSessionTtl(session.expiresAt)
        );
      }
    }
  }
  clearCookies(res);
};


// ============================================================
// EMAIL VERIFY / OTP
// ============================================================
const verifyEmail = async (email, otp) => {
  if (!email || !otp) throw new AppError("Invalid verification request.", 400);

  const user = await User.findOne({ email: normalizeEmail(email) }).select(
    "+otp"
  );

  if (!(await verifyOtp(user, otp))) {
    throw new AppError("Invalid or expired OTP.", 400);
  }

  user.isVerified = true;
  user.otp = undefined;
  user.otpExpires = undefined;
  await user.save();
  await clearOtp(user);
};

const resendOtp = async (email) => {
  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user) throw new AppError("User with this email does not exist.", 404);

  const otp = await saveOtp(user);
  await (user.isVerified
    ? sendOtpEmail(user.email, otp)
    : sendVerificationOtpEmail(user.email, otp));
};


// ============================================================
// PASSWORD RESET / CHANGE
// ============================================================
const forgotPassword = async (email) => {
  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user) throw new AppError("User with this email does not exist.", 404);
  await sendOtpEmail(user.email, await saveOtp(user));
};

const resetPassword = async (email, otp, password) => {
  const user = await User.findOne({ email: normalizeEmail(email) }).select(
    "+otp +password"
  );

  if (!(await verifyOtp(user, otp))) {
    throw new AppError("Invalid or expired OTP.", 400);
  }

  user.password = await hashPassword(password);
  user.otp = undefined;
  user.otpExpires = undefined;

  // Revoke all existing sessions on password reset
  const now = new Date();
  const sessions = user.refreshSessions || [];
  for (const session of sessions) {
    if (!session.revokedAt) {
      session.revokedAt = now;
      await setSessionState(
        session.jti,
        "revoked",
        remainingSessionTtl(session.expiresAt)
      );
    }
  }
  user.refreshSessions = pruneExpiredSessions(sessions, now);

  await user.save();
  await clearOtp(user);
  await invalidateUserCache(user.id);
};

const changePassword = async (userId, oldPassword, newPassword) => {
  const user = await User.findById(userId).select("+password");
  if (!user) throw new AppError("User not found.", 404);

  const ok = await comparePassword(oldPassword, user.password);
  if (!ok) throw new AppError("Old password is incorrect.", 400);

  user.password = await hashPassword(newPassword);

  // Revoke all existing sessions on password change
  const now = new Date();
  const sessions = user.refreshSessions || [];
  for (const session of sessions) {
    if (!session.revokedAt) {
      session.revokedAt = now;
      await setSessionState(
        session.jti,
        "revoked",
        remainingSessionTtl(session.expiresAt)
      );
    }
  }
  user.refreshSessions = pruneExpiredSessions(sessions, now);

  await user.save();
  await invalidateUserCache(userId);
};


// ============================================================
// PROFILE
// ============================================================
const updateProfile = async (userId, updates) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404);

  if (updates.email) {
    updates.email = normalizeEmail(updates.email);
    const emailTaken = await User.exists({
      email: updates.email,
      _id: { $ne: userId },
    });
    if (emailTaken) {
      throw new AppError(
        "Email is already associated with another account",
        400
      );
    }
  }

  Object.assign(user, updates);
  await user.save();
  await invalidateUserCache(userId);
  return publicUser(user);
};


// ============================================================
// OAUTH LINK
// ============================================================
const linkProvider = async (provider, providerId, profile) => {
  const email = profile.emails?.[0]?.value?.trim().toLowerCase();
  if (!email) {
    throw new AppError(`${provider} did not provide an email address`, 400);
  }

  const field = `${provider}Id`;
  const profilePicture =
    provider === "google" ? getGoogleProfilePictureUrl(profile) : null;

  let user =
    (await User.findOne({ [field]: providerId })) ||
    (await User.findOne({ email }));

  if (user) {
    if (user[field] && user[field] !== providerId) {
      throw new AppError(
        "This account is linked to another provider identity",
        409
      );
    }
    user[field] = providerId;
    user.isVerified = true;
    if (profilePicture) user.profilePicture = profilePicture;
    await user.save();
    await invalidateUserCache(user.id);
    return user;
  }

  const base =
    (profile.displayName || `${provider} user`)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 24) || provider;

  let userName = base;
  for (let suffix = 1; await User.exists({ userName }); suffix += 1) {
    userName = `${base.slice(0, 30 - String(suffix).length)}${suffix}`;
  }

  return new User({
    userName,
    email,
    password: await hashPassword(crypto.randomBytes(32).toString("hex")),
    [`${provider}Id`]: providerId,
    ...(profilePicture ? { profilePicture } : {}),
    isVerified: true,
  }).save();
};


// ============================================================
// DELETE ACCOUNT
// ============================================================
const deleteAccount = async (userId, res) => {
  const deleted = await User.findByIdAndDelete(userId);
  if (!deleted) throw new AppError("User not found.", 404);
  await Promise.all([
    invalidateUserCache(userId),
    ...(deleted.refreshSessions || []).map((session) =>
      setSessionState(
        session.jti,
        "revoked",
        remainingSessionTtl(session.expiresAt)
      )
    ),
  ]);
  clearCookies(res);
};


// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  issueSession,
  registerUser,
  authenticateLocal,
  refreshSession,
  logout,
  verifyEmail,
  resendOtp,
  forgotPassword,
  resetPassword,
  changePassword,
  updateProfile,
  linkProvider,
  deleteAccount,
  pruneExpiredSessions,
};