const { z } = require("zod");

const email = z.string().trim().email("Please enter a valid email").transform((value) => value.toLowerCase());
const password = z.string().min(8, "Password must be at least 8 characters");
const otp = z.string().regex(/^\d{6}$/, "OTP must be a 6-digit code");
const username = z.string().trim().min(3, "Username must be at least 3 characters").max(30, "Username must not exceed 30 characters");

const register = z.object({ userName: username, email, password });
const login = z.object({ email, password: z.string().min(1, "Password is required") });
const forgotPassword = z.object({ email });
const resetPassword = z.object({ email, otp, newPassword: password });
const verifyEmail = z.object({ email, otp });

const profile = z.object({
  userName: username.optional(),
  email: email.optional(),
}).strict();

const changePassword = z.object({
  oldPassword: z.string().min(1, "Current password is required"),
  newPassword: password,
});

const adminUpdateUser = z.object({
  userName: z.string().trim().min(3, "Username must be at least 3 characters").max(30).optional(),
  email: email.optional(),
  role: z.enum(["user", "admin", "business"], "Invalid user role").optional(),
  isVerified: z.boolean().optional(),
}).strict();

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  verifyEmail,
  profile,
  changePassword,
  adminUpdateUser,
};
