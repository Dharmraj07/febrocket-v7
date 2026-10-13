const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");
const { AppError } = require("../controllers/authController");
const {
  getUserCache,
  setUserCache,
  getSessionState,
} = require("../utils/redisStore");

const loadIdentity = async (userId) => {
  const cachedUser = await getUserCache(userId);
  if (cachedUser) return cachedUser;

  const user = await User.findById(userId).select("email role userName profilePicture");
  if (!user) return null;

  const identity = {
    id: String(user._id),
    email: user.email,
    role: user.role,
    userName: user.userName,
    profilePicture: user.profilePicture || null,
  };
  await setUserCache(userId, identity, config.userCacheTtlSeconds);
  return identity;
};

const getTokenFromRequest = (req, { allowExtensionCookie = false } = {}) => {
  if (req.cookies?.[config.COOKIE_NAMES.ACCESS]) {
    return req.cookies[config.COOKIE_NAMES.ACCESS];
  }

  if (
    allowExtensionCookie &&
    req.cookies?.[config.COOKIE_NAMES.EXTENSION_ACCESS]
  ) {
    return req.cookies[config.COOKIE_NAMES.EXTENSION_ACCESS];
  }

  const authorization = req.headers.authorization;
  if (!authorization) return null;

  if (authorization.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  return authorization;
};

const requireAuth = (options = {}) => async (req, _res, next) => {
  const token = getTokenFromRequest(req, options);

  if (!token) {
    return next(new AppError("Unauthorized access. Please log in.", 401));
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwtAccessSecret);
  } catch (_error) {
    return next(new AppError("Unauthorized access. Invalid token.", 401));
  }

  try {
    if (payload.sid) {
      const state = await getSessionState(payload.sid);
      if (state === "revoked") {
        return next(new AppError("Unauthorized access. Session expired.", 401));
      }

      const activeSession = await User.exists({
        _id: payload.id,
        refreshSessions: {
          $elemMatch: {
            jti: payload.sid,
            revokedAt: null,
            expiresAt: { $gt: new Date() },
          },
        },
      });
      if (!activeSession) {
        return next(new AppError("Unauthorized access. Session expired.", 401));
      }
    }

    const identity = await loadIdentity(String(payload.id));
    if (!identity) {
      return next(new AppError("Unauthorized access. User no longer exists.", 401));
    }

    req.user = identity;
    if (options.adminOnly && identity.role !== config.ROLES.ADMIN) {
      return next(new AppError("Access denied. Admin privileges required.", 403));
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = requireAuth;