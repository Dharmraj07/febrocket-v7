// ============================================================
// IMPORTS
// ============================================================
const mongoose = require("mongoose");
const config = require("../config");
const { COOKIE_NAMES } = config;
const User = require("../models/User");
const authHelpers = require("../utils/authHelpers");
const { AppError } = authHelpers;
const { setExtensionCookies } = authHelpers;
const {
  invalidateUserCache,
  setSessionState,
} = require("../utils/redisStore");
const shareService = require("../service/shareService");

const {
  issueSession,
  registerUser,
  refreshSession,
  logout,
  verifyEmail,
  resendOtp,
  forgotPassword,
  resetPassword,
  changePassword,
  updateProfile,
  deleteAccount,
} = require("../service/authService");


// ============================================================
// SHARED RESPONSE HELPER
// ============================================================
const sendSuccess = (res, statusCode, message, data) => {
  const response = { success: true, message };
  if (data !== undefined && data !== null) response.user = data;
  return res.status(statusCode).json(response);
};

/** Throws if `id` is not a valid MongoDB ObjectId. */
const requireObjectId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid user ID.", 400);
  }
};

/** Fields we always exclude from user responses. */
const publicFields = "-password -otp -verificationToken";
const isBrowserExtensionOrigin = (origin) =>
  typeof origin === "string" &&
  /^(chrome-extension:\/\/[a-p]{32}|moz-extension:\/\/[0-9a-f-]+)$/i.test(origin);

const requireBrowserExtensionOrigin = (req) => {
  const origin = req.get?.("origin") || req.headers?.origin;
  if (!isBrowserExtensionOrigin(origin)) {
    throw new AppError("Invalid extension refresh request.", 403);
  }
};


// ============================================================
// AUTH HANDLERS
// ============================================================

exports.register = async (req, res) => {
  return sendSuccess(
    res,
    201,
    "Registration successful. Please check your email to verify your account."
  );
};

exports.login = async (req, res) =>
  sendSuccess(
    res,
    200,
    "Logged in successfully",
    await issueSession(req.user, req, res)
  );

exports.oauthLogin = async (req, res) => {
  try {
    await issueSession(req.user, req, res);
    return res.redirect(config.oauthSuccessRedirect);
  } catch (error) {
    console.error("OAuth session creation failed:", error);

    return res.status(500).json({
      success: false,
      message: "OAuth session creation failed",
    });
  }
};

exports.refresh = async (req, res) => {
  const websiteRefresh = req.cookies?.[COOKIE_NAMES.REFRESH];
  const extensionRefresh = req.cookies?.[COOKIE_NAMES.EXTENSION_REFRESH];
  if (!websiteRefresh && extensionRefresh) {
    requireBrowserExtensionOrigin(req);
  }

  await refreshSession(
    websiteRefresh || extensionRefresh,
    req,
    res
  );
  return sendSuccess(res, 200, "Token refreshed successfully");
};

exports.logout = async (req, res) => {
  await logout(
    req.cookies?.[COOKIE_NAMES.REFRESH] ||
      req.cookies?.[COOKIE_NAMES.EXTENSION_REFRESH],
    res
  );
  return sendSuccess(res, 200, "Logged out successfully");
};

exports.attachExtensionCookies = (req, _res, next) => {
  const access =
    req.cookies?.[COOKIE_NAMES.ACCESS] ||
    req.cookies?.[COOKIE_NAMES.EXTENSION_ACCESS];
  const refresh =
    req.cookies?.[COOKIE_NAMES.REFRESH] ||
    req.cookies?.[COOKIE_NAMES.EXTENSION_REFRESH];

  if (access && refresh) {
    setExtensionCookies(_res, access, refresh);
  }
  return next();
};

exports.verifyEmail = async (req, res) => {
  const { email, otp } = req.method === "GET" ? req.query : req.body;
  await verifyEmail(email, otp);
  return sendSuccess(res, 200, "Email verified successfully.");
};

exports.resendOtp = async (req, res) => {
  await resendOtp(req.body.email);
  return sendSuccess(res, 200, "OTP resent successfully to your email.");
};

exports.forgotPassword = async (req, res) => {
  await forgotPassword(req.body.email);
  return sendSuccess(res, 200, "OTP sent to your email.");
};

exports.resetPassword = async (req, res) => {
  await resetPassword(req.body.email, req.body.otp, req.body.newPassword);
  return sendSuccess(res, 200, "Password reset successfully.");
};

exports.changePassword = async (req, res) => {
  await changePassword(req.user.id, req.body.oldPassword, req.body.newPassword);
  return sendSuccess(res, 200, "Password changed successfully.");
};

exports.editProfile = async (req, res) =>
  sendSuccess(
    res,
    200,
    "Profile updated successfully",
    await updateProfile(req.user.id, req.body)
  );

exports.deleteAccount = async (req, res) => {
  await deleteAccount(req.user.id, res);
  return sendSuccess(res, 200, "Account deleted successfully.");
};

exports.generateShareCode = async (req, res) => {
  const { code, expiresAt } = await shareService.generateShareCodeForUser(req.user.id);
  return res.status(200).json({
    success: true,
    message: "Sharing code generated successfully",
    data: {
      code,
      expiresAt: expiresAt.toISOString(),
    },
  });
};

exports.connectWithShareCode = async (req, res) => {
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  const normalized = shareService.normalizeShareCode(code);
  if (!normalized) {
    throw new AppError("Invalid or expired sharing code.", 400);
  }

  const { user, role } = await shareService.connectWithCode(req.user.id, normalized);
  return res.status(200).json({
    success: true,
    message: "Connected successfully",
    data: {
      connected: true,
      user,
      role,
    },
  });
};

exports.getCurrentConnection = async (req, res) => {
  const payload = await shareService.getConnectionForUser(req.user.id);
  return res.status(200).json({
    success: true,
    data: payload,
  });
};

exports.disconnectConnection = async (req, res) => {
  await shareService.disconnectConnectionForUser(req.user.id);
  return res.status(200).json({
    success: true,
    message: "Disconnected successfully",
  });
};

exports.cancelShareCode = async (req, res) => {
  await shareService.clearShareCodeFields(req.user.id);
  return res.status(200).json({
    success: true,
    message: "Sharing code cancelled successfully",
  });
};


// ============================================================
// ADMIN HANDLERS
// ============================================================

exports.getAllUsers = async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
  const search = req.query.search?.trim() || "";

  const filter = search
    ? {
        $or: [
          { userName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }
    : {};

  if (req.query.ids !== undefined) {
    const ids =
      typeof req.query.ids === "string"
        ? req.query.ids.split(",").filter(Boolean)
        : [];
    if (
      !ids.length ||
      ids.length > 100 ||
      ids.some((id) => !mongoose.isValidObjectId(id))
    ) {
      throw new AppError("Invalid user ID list.", 400);
    }
    filter._id = { $in: ids };
  }

  const [users, totalUsers] = await Promise.all([
    User.find(filter)
      .select(publicFields)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalUsers / limit);

  return res.status(200).json({
    success: true,
    count: users.length,
    totalUsers,
    totalPages,
    currentPage: page,
    limit,
    search,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    users,
  });
};

exports.getUserById = async (req, res) => {
  requireObjectId(req.params.id);
  const user = await User.findById(req.params.id).select(publicFields);
  if (!user) throw new AppError("User not found.", 404);
  return res.status(200).json({ success: true, user });
};

exports.updateUser = async (req, res) => {
  const { userName, email, role, isVerified } = req.body;
  const userId = req.params.id;
  requireObjectId(userId);

  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found.", 404);

  if (
    userName !== undefined &&
    userName !== user.userName &&
    (await User.exists({ userName, _id: { $ne: userId } }))
  ) {
    throw new AppError("Username is already in use.", 400);
  }

  const normalizedEmail = email?.toLowerCase();
  if (
    normalizedEmail &&
    normalizedEmail !== user.email &&
    (await User.exists({ email: normalizedEmail, _id: { $ne: userId } }))
  ) {
    throw new AppError("Email is already in use.", 400);
  }

  if (userName !== undefined) user.userName = userName;
  if (normalizedEmail !== undefined) user.email = normalizedEmail;
  if (role !== undefined) user.role = role;
  if (isVerified !== undefined) user.isVerified = isVerified;

  await user.save();
  await invalidateUserCache(userId);
  const updatedUser = await User.findById(userId).select(publicFields);

  return res.status(200).json({
    success: true,
    message: "User updated successfully.",
    user: updatedUser,
  });
};

exports.deleteUser = async (req, res) => {
  const userId = req.params.id;
  requireObjectId(userId);

  if (req.user.id === userId) {
    throw new AppError("You cannot delete your own admin account.", 400);
  }

  const deleted = await User.findByIdAndDelete(userId);
  if (!deleted) throw new AppError("User not found.", 404);

  await Promise.all([
    invalidateUserCache(userId),
    ...(deleted.refreshSessions || []).map((session) =>
      setSessionState(
        session.jti,
        "revoked",
        Math.max(0, new Date(session.expiresAt).getTime() - Date.now())
      )
    ),
  ]);

  return res.status(200).json({
    success: true,
    message: "User deleted successfully.",
    userId,
  });
};

module.exports = {
  ...authHelpers,
  issueSession,
  registerUser,
  authenticateLocal: require("../service/authService").authenticateLocal,
  refreshSession,
  linkProvider: require("../service/authService").linkProvider,
  logoutSession: logout,
  verifyEmailService: verifyEmail,
  resendOtpService: resendOtp,
  forgotPasswordService: forgotPassword,
  resetPasswordService: resetPassword,
  changePasswordService: changePassword,
  updateProfileService: updateProfile,
  deleteAccountService: deleteAccount,
  register: exports.register,
  login: exports.login,
  oauthLogin: exports.oauthLogin,
  refresh: exports.refresh,
  logout: exports.logout,
  attachExtensionCookies: exports.attachExtensionCookies,
  verifyEmail: exports.verifyEmail,
  resendOtp: exports.resendOtp,
  forgotPassword: exports.forgotPassword,
  resetPassword: exports.resetPassword,
  changePassword: exports.changePassword,
  editProfile: exports.editProfile,
  deleteAccount: exports.deleteAccount,
  generateShareCode: exports.generateShareCode,
  connectWithShareCode: exports.connectWithShareCode,
  getCurrentConnection: exports.getCurrentConnection,
  disconnectConnection: exports.disconnectConnection,
  cancelShareCode: exports.cancelShareCode,
  isBrowserExtensionOrigin,
  getAllUsers: exports.getAllUsers,
  getUserById: exports.getUserById,
  updateUser: exports.updateUser,
  deleteUser: exports.deleteUser,
};
