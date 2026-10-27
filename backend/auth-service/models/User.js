const mongoose = require("mongoose");
const { isGoogleProfilePictureUrl } = require("../utils/profilePicture");

const UserSchema = new mongoose.Schema(
  {
    userName: {
      type: String,
      required: [true, "Username is required"],
      unique: [true, "Username must be unique"],
      minlength: [3, "Username must be at least 3 characters long"],
      maxlength: [30, "Username must not exceed 30 characters"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: [true, "Email must be unique"],
      match: [
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        "Please provide a valid email address",
      ],
      lowercase: true,
    },
    profilePicture: {
      type: String,
      trim: true,
      default: null,
      validate: {
        validator: (value) => value == null || isGoogleProfilePictureUrl(value),
        message: "Profile picture must be an HTTPS Google profile image URL",
      },
    },
    shareCodeHash: {
      type: String,
      default: null,
      select: false,
      index: true,
      sparse: true,
    },
    shareCodeExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    connectedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
      sparse: true,
    },
    connectionRole: {
      type: String,
      enum: ["owner", "viewer"],
      default: null,
    },
    password: {
      type: String,
      select: false,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters long"],
    },
    mobileNumber: {
      type: String,
      trim: true,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    facebookId: {
      type: String,
      unique: true,
      sparse: true,
    },
    role: {
      type: String,
      enum: ["user", "admin", "business"],
      default: "user",
    },
    otp: {
      type: String,
      select: false,
    },
    otpExpires: {
      type: Date,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: {
      type: String,
      select: false,
    },
    verificationTokenExpires: {
      type: Date,
    },
    refreshSessions: [
      {
        jti: {
          type: String,
          required: true,
          index: true,
        },
        tokenHash: {
          type: String,
          required: true,
          index: true,
        },
        revokedAt: {
          type: Date,
          default: null,
        },
        replacedByJti: {
          type: String,
          default: null,
        },
        expiresAt: {
          type: Date,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        userAgent: {
          type: String,
          default: "",
        },
        ipAddress: {
          type: String,
          default: "",
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", UserSchema);
module.exports = User;