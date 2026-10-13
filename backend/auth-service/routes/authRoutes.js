const express = require("express");
const passport = require("passport");
const config = require("../config");
const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const passportAuthenticate = require("../middleware/passportAuthenticate");
const { authLimiter, passwordLimiter } = require("../middleware/rateLimiters");
const authValidators = require("../validation/authValidators");

const router = express.Router();

const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);
  if (result.success) {
    req.body = result.data;
    return next();
  }

  return next(new authController.AppError(
    "Request validation failed",
    400,
    result.error.issues,
  ));
};

const currentUser = (req, res) => res.json({ success: true, user: req.user });

// OAuth login.
router.get("/google", authLimiter, passport.authenticate("google", {
  scope: ["openid", "profile", "email"],
  session: false,
}));

router.get("/google/callback", authLimiter, passport.authenticate("google", {
  failureRedirect: config.oauthFailureRedirect,
  session: false,
}), authController.oauthLogin);

router.get("/facebook", authLimiter, passport.authenticate("facebook", {
  scope: ["public_profile", "email"],
  session: false,
}));

router.get("/facebook/callback", authLimiter, passport.authenticate("facebook", {
  failureRedirect: config.oauthFailureRedirect,
  session: false,
}), authController.oauthLogin);

// Local authentication.
router.post(
  "/register",
  authLimiter,
  validate(authValidators.register),
  passportAuthenticate("local-register"),
  authController.register,
);

router.post(
  "/login",
  authLimiter,
  validate(authValidators.login),
  passportAuthenticate("local-login"),
  authController.login,
);

router.post("/refresh", authLimiter, authController.refresh);
router.post("/logout", authController.logout);

// Email and password recovery.
router.post(
  "/verify-email",
  passwordLimiter,
  validate(authValidators.verifyEmail),
  authController.verifyEmail,
);
router.get("/verify-email", authController.verifyEmail);
router.post(
  "/forgot-password",
  passwordLimiter,
  validate(authValidators.forgotPassword),
  authController.forgotPassword,
);
router.post(
  "/resend-otp",
  passwordLimiter,
  validate(authValidators.forgotPassword),
  authController.resendOtp,
);
router.post(
  "/reset-password",
  passwordLimiter,
  validate(authValidators.resetPassword),
  authController.resetPassword,
);

// Authenticated user actions.
router.get(
  "/session",
  authMiddleware(),
  authController.attachExtensionCookies,
  currentUser,
);
router.get(
  "/me",
  authMiddleware({ allowExtensionCookie: true }),
  authController.attachExtensionCookies,
  currentUser,
);
router.put(
  "/profile",
  authMiddleware(),
  validate(authValidators.profile),
  authController.editProfile,
);
router.put(
  "/change-password",
  authMiddleware(),
  validate(authValidators.changePassword),
  authController.changePassword,
);
router.delete("/account", authMiddleware(), authController.deleteAccount);

// Admin user management.
router.get("/admin/users", authMiddleware({ adminOnly: true }), authController.getAllUsers);
router.get("/admin/users/:id", authMiddleware({ adminOnly: true }), authController.getUserById);
router.put(
  "/admin/users/:id",
  authMiddleware({ adminOnly: true }),
  validate(authValidators.adminUpdateUser),
  authController.updateUser,
);
router.delete("/admin/users/:id", authMiddleware({ adminOnly: true }), authController.deleteUser);

module.exports = router;
