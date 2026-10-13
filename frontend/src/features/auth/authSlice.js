
import { createAction, createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { api } from "../../lib/api.js";

const AUTH_CHANNEL_NAME = "febrocket-auth-events";
const AUTH_STORAGE_EVENT_KEY = "febrocket-auth-event";
let authBroadcastChannel;

export const remoteLogout = createAction("auth/remoteLogout");

function broadcastLogout() {
  if (typeof window === "undefined") return;

  if ("BroadcastChannel" in window) {
    try {
      authBroadcastChannel ??= new BroadcastChannel(AUTH_CHANNEL_NAME);
      authBroadcastChannel.postMessage({ type: "logout" });
      return;
    } catch (error) {
      console.warn("Could not broadcast logout to other tabs:", error);
    }
  }

  try {
    window.localStorage.setItem(AUTH_STORAGE_EVENT_KEY, String(Date.now()));
    window.localStorage.removeItem(AUTH_STORAGE_EVENT_KEY);
  } catch (error) {
    console.warn("Could not notify other tabs about logout:", error);
  }
}

/*
|--------------------------------------------------------------------------
| Initial State
|--------------------------------------------------------------------------
*/

const initialState = {
  user: null,

  authChecked: false,
  authCheckStatus: null,
  isLoading: false,

  error: null,
  message: null,
};

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function getUserFromPayload(payload) {
  if (!payload || typeof payload !== "object") return null;

  return payload.user || payload.data?.user || null;
}

function getErrorPayload(error, fallbackMessage = "Something went wrong.") {
  const status = error?.response?.status ?? null;
  const candidate =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    "";
  const technical =
    typeof candidate !== "string" ||
    candidate.length > 240 ||
    /request failed|network error|timeout|axios|stack|trace|exception|api.?key|token|mongo|redis|database|worker|https?:\/\/|access.?denied|\bECONN\w*|\bat\s+\S+\s+\(/i.test(candidate);
  const isTimeout = ["ECONNABORTED", "ETIMEDOUT"].includes(error?.code);
  const isNetworkFailure = !status && Boolean(error?.request);
  const message = technical
    ? status === 401
      ? "Please sign in again."
      : status === 403
        ? "You do not have permission to do that."
        : status >= 500
          ? "The service is temporarily unavailable. Please try again."
          : isTimeout
            ? "The request took too long. Check your connection and try again."
            : isNetworkFailure
              ? "Connection problem. Check your network and try again."
              : fallbackMessage
    : candidate || fallbackMessage;

  return { message, status };
}

function getSuccessMessage(response, fallbackMessage = null) {
  return response?.data?.message || fallbackMessage;
}

/*
|--------------------------------------------------------------------------
| OAuth
|--------------------------------------------------------------------------
|
| OAuth routes are browser redirects, not normal Axios JSON requests.
| Use:
|
| window.location.href = `${API_BASE_URL}/api/auth/google`;
|
| Facebook:
|
| window.location.href = `${API_BASE_URL}/api/auth/facebook`;
|
*/

/*
|--------------------------------------------------------------------------
| Register
|--------------------------------------------------------------------------
*/

export const registerUser = createAsyncThunk(
  "auth/registerUser",
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await api.post(
        "/api/auth/register",
        credentials,
        {
          withCredentials: true,
        }
      );

      broadcastLogout();
      return {
        user: getUserFromPayload(response.data),
        message: getSuccessMessage(
          response,
          "Registration successful."
        ),
        response: response.data,
      };
    } catch (error) {
      broadcastLogout();
      return rejectWithValue(
        getErrorPayload(error, "Registration failed.")
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| Login
|--------------------------------------------------------------------------
*/

export const loginUser = createAsyncThunk(
  "auth/loginUser",
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await api.post(
        "/api/auth/login",
        credentials,
        {
          withCredentials: true,
        }
      );

      return {
        user: getUserFromPayload(response.data),
        message: getSuccessMessage(
          response,
          "Logged in successfully."
        ),
        response: response.data,
      };
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(error, "Login failed.")
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| Check Session
|--------------------------------------------------------------------------
*/

export const checkAuthSession = createAsyncThunk(
  "auth/checkAuthSession",
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get(
        "/api/auth/session",
        {
          withCredentials: true,
        }
      );

      const user = getUserFromPayload(response.data);

      if (!user) {
        return rejectWithValue({
          message: "Authenticated user was not returned.",
          status: null,
        });
      }

      return user;
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Authentication check failed."
        )
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| Get Current User
|--------------------------------------------------------------------------
*/

export const getCurrentUser = createAsyncThunk(
  "auth/getCurrentUser",
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get(
        "/api/auth/me",
        {
          withCredentials: true,
        }
      );

      const user = getUserFromPayload(response.data);

      if (!user) {
        return rejectWithValue({
          message: "User information was not returned.",
          status: null,
        });
      }

      return user;
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Failed to fetch current user."
        )
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| Refresh Token
|--------------------------------------------------------------------------
*/

export const refreshAuth = createAsyncThunk(
  "auth/refreshAuth",
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.post(
        "/api/auth/refresh",
        {},
        {
          withCredentials: true,
        }
      );

      return {
        user: getUserFromPayload(response.data),
        message: getSuccessMessage(
          response,
          "Token refreshed successfully."
        ),
        response: response.data,
      };
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Session refresh failed."
        )
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| Logout
|--------------------------------------------------------------------------
*/

export const logoutUser = createAsyncThunk(
  "auth/logoutUser",
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.post(
        "/api/auth/logout",
        {},
        {
          withCredentials: true,
        }
      );

      return {
        message: getSuccessMessage(
          response,
          "Logged out successfully."
        ),
      };
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Logout failed."
        )
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| Verify Email
|--------------------------------------------------------------------------
*/

export const verifyEmail = createAsyncThunk(
  "auth/verifyEmail",
  async ({ email, otp }, { rejectWithValue }) => {
    try {
      const response = await api.post(
        "/api/auth/verify-email",
        {
          email,
          otp,
        },
        {
          withCredentials: true,
        }
      );

      return {
        message: getSuccessMessage(
          response,
          "Email verified successfully."
        ),
      };
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Email verification failed."
        )
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| Verify Email via GET
|--------------------------------------------------------------------------
|
| Optional alternative:
| /api/auth/verify-email?email=...&otp=...
|
*/

export const verifyEmailByLink = createAsyncThunk(
  "auth/verifyEmailByLink",
  async ({ email, otp }, { rejectWithValue }) => {
    try {
      const response = await api.get(
        "/api/auth/verify-email",
        {
          params: {
            email,
            otp,
          },
          withCredentials: true,
        }
      );

      return {
        message: getSuccessMessage(
          response,
          "Email verified successfully."
        ),
      };
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Email verification failed."
        )
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| Forgot Password
|--------------------------------------------------------------------------
*/

export const forgotPassword = createAsyncThunk(
  "auth/forgotPassword",
  async ({ email }, { rejectWithValue }) => {
    try {
      const response = await api.post(
        "/api/auth/forgot-password",
        {
          email,
        }
      );

      return {
        message: getSuccessMessage(
          response,
          "OTP sent to your email."
        ),
      };
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Forgot password request failed."
        )
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| Resend OTP
|--------------------------------------------------------------------------
*/

export const resendOtp = createAsyncThunk(
  "auth/resendOtp",
  async ({ email }, { rejectWithValue }) => {
    try {
      const response = await api.post(
        "/api/auth/resend-otp",
        {
          email,
        }
      );

      return {
        message: getSuccessMessage(
          response,
          "OTP resent successfully."
        ),
      };
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Failed to resend OTP."
        )
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| Reset Password
|--------------------------------------------------------------------------
*/

export const resetPassword = createAsyncThunk(
  "auth/resetPassword",
  async (
    { email, otp, newPassword },
    { rejectWithValue }
  ) => {
    try {
      const response = await api.post(
        "/api/auth/reset-password",
        {
          email,
          otp,
          newPassword,
        }
      );

      return {
        message: getSuccessMessage(
          response,
          "Password reset successfully."
        ),
      };
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Password reset failed."
        )
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| Update Profile
|--------------------------------------------------------------------------
*/

export const updateProfile = createAsyncThunk(
  "auth/updateProfile",
  async (profileData, { rejectWithValue }) => {
    try {
      const response = await api.put(
        "/api/auth/profile",
        profileData,
        {
          withCredentials: true,
        }
      );

      return {
        user: getUserFromPayload(response.data),
        message: getSuccessMessage(
          response,
          "Profile updated successfully."
        ),
      };
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Profile update failed."
        )
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| Change Password
|--------------------------------------------------------------------------
*/

export const changePassword = createAsyncThunk(
  "auth/changePassword",
  async (
    { oldPassword, newPassword },
    { rejectWithValue }
  ) => {
    try {
      const response = await api.put(
        "/api/auth/change-password",
        {
          oldPassword,
          newPassword,
        },
        {
          withCredentials: true,
        }
      );

      return {
        message: getSuccessMessage(
          response,
          "Password changed successfully."
        ),
      };
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Password change failed."
        )
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| Delete Own Account
|--------------------------------------------------------------------------
*/

export const deleteAccount = createAsyncThunk(
  "auth/deleteAccount",
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.delete(
        "/api/auth/account",
        {
          withCredentials: true,
        }
      );

      broadcastLogout();
      return {
        message: getSuccessMessage(
          response,
          "Account deleted successfully."
        ),
      };
    } catch (error) {
      return rejectWithValue(
        getErrorPayload(
          error,
          "Account deletion failed."
        )
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| Slice
|--------------------------------------------------------------------------
*/

const authSlice = createSlice({
  name: "auth",
  initialState,

  reducers: {
    clearAuthError: (state) => {
      state.error = null;
    },

    clearAuthMessage: (state) => {
      state.message = null;
    },

  },

  extraReducers: (builder) => {
    builder

      /*
      |--------------------------------------------------------------------------
      | Register
      |--------------------------------------------------------------------------
      */

      .addCase(registerUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.message = null;
      })

      .addCase(registerUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = null;
        state.message = action.payload.message;

        if (action.payload.user) {
          state.user = action.payload.user;
        }

        state.authChecked = true;
      })

      .addCase(registerUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          action.payload?.message ||
          action.error.message ||
          "Registration failed.";
      })

      /*
      |--------------------------------------------------------------------------
      | Login
      |--------------------------------------------------------------------------
      */

      .addCase(loginUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.message = null;
      })

      .addCase(loginUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.authChecked = true;
        state.authCheckStatus = null;
        state.error = null;
        state.message = action.payload.message;
      })

      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.user = null;
        state.authChecked = true;
        state.error =
          action.payload?.message ||
          action.error.message ||
          "Login failed.";
      })

      /*
      |--------------------------------------------------------------------------
      | Check Session
      |--------------------------------------------------------------------------
      */

      .addCase(checkAuthSession.pending, (state) => {
        state.isLoading = true;
        state.authCheckStatus = null;
        state.error = null;
      })

      .addCase(checkAuthSession.fulfilled, (state, action) => {
        state.user = action.payload;
        state.authChecked = true;
        state.authCheckStatus = null;
        state.isLoading = false;
        state.error = null;
      })

      .addCase(checkAuthSession.rejected, (state, action) => {
        state.user = null;
        state.authChecked = true;
        state.authCheckStatus = action.payload?.status ?? "transient";
        state.isLoading = false;
        state.error =
          action.payload?.message ||
          action.error.message ||
          "Authentication failed.";
      })

      /*
      |--------------------------------------------------------------------------
      | Current User
      |--------------------------------------------------------------------------
      */

      .addCase(getCurrentUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })

      .addCase(getCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.authChecked = true;
        state.isLoading = false;
        state.error = null;
      })

      .addCase(getCurrentUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          action.payload?.message ||
          action.error.message ||
          "Failed to fetch current user.";
      })

      /*
      |--------------------------------------------------------------------------
      | Refresh
      |--------------------------------------------------------------------------
      */

      .addCase(refreshAuth.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })

      .addCase(refreshAuth.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = null;
        state.message = action.payload.message;

        if (action.payload.user) {
          state.user = action.payload.user;
        }
      })

      .addCase(refreshAuth.rejected, (state, action) => {
        state.isLoading = false;
        state.user = null;
        state.authChecked = true;
        state.error =
          action.payload?.message ||
          action.error.message ||
          "Session refresh failed.";
      })

      /*
      |--------------------------------------------------------------------------
      | Logout
      |--------------------------------------------------------------------------
      */

      .addCase(logoutUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })

      .addCase(logoutUser.fulfilled, (state, action) => {
        state.user = null;
        state.authChecked = true;
        state.authCheckStatus = null;
        state.isLoading = false;
        state.error = null;
        state.message = action.payload.message;
      })

      .addCase(logoutUser.rejected, (state, action) => {
        // Backend logout may fail, but client should still clear
        // its local auth state.
        state.user = null;
        state.authChecked = true;
        state.authCheckStatus = null;
        state.isLoading = false;
        state.error =
          action.payload?.message ||
          action.error.message ||
          "Logout failed.";
      })
      .addCase(remoteLogout, (state) => {
        state.user = null;
        state.authChecked = true;
        state.authCheckStatus = null;
        state.isLoading = false;
        state.error = null;
        state.message = null;
      })

      /*
      |--------------------------------------------------------------------------
      | Verify Email
      |--------------------------------------------------------------------------
      */

      .addCase(verifyEmail.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })

      .addCase(verifyEmail.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = null;
        state.message = action.payload.message;
      })

      .addCase(verifyEmail.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          action.payload?.message ||
          action.error.message ||
          "Email verification failed.";
      })

      /*
      |--------------------------------------------------------------------------
      | Verify Email By Link
      |--------------------------------------------------------------------------
      */

      .addCase(verifyEmailByLink.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })

      .addCase(verifyEmailByLink.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = null;
        state.message = action.payload.message;
      })

      .addCase(verifyEmailByLink.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          action.payload?.message ||
          action.error.message ||
          "Email verification failed.";
      })

      /*
      |--------------------------------------------------------------------------
      | Forgot Password
      |--------------------------------------------------------------------------
      */

      .addCase(forgotPassword.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })

      .addCase(forgotPassword.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = null;
        state.message = action.payload.message;
      })

      .addCase(forgotPassword.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          action.payload?.message ||
          action.error.message ||
          "Forgot password request failed.";
      })

      /*
      |--------------------------------------------------------------------------
      | Resend OTP
      |--------------------------------------------------------------------------
      */

      .addCase(resendOtp.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })

      .addCase(resendOtp.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = null;
        state.message = action.payload.message;
      })

      .addCase(resendOtp.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          action.payload?.message ||
          action.error.message ||
          "Failed to resend OTP.";
      })

      /*
      |--------------------------------------------------------------------------
      | Reset Password
      |--------------------------------------------------------------------------
      */

      .addCase(resetPassword.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })

      .addCase(resetPassword.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = null;
        state.message = action.payload.message;
      })

      .addCase(resetPassword.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          action.payload?.message ||
          action.error.message ||
          "Password reset failed.";
      })

      /*
      |--------------------------------------------------------------------------
      | Update Profile
      |--------------------------------------------------------------------------
      */

      .addCase(updateProfile.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })

      .addCase(updateProfile.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = null;
        state.message = action.payload.message;

        if (action.payload.user) {
          state.user = action.payload.user;
        }
      })

      .addCase(updateProfile.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          action.payload?.message ||
          action.error.message ||
          "Profile update failed.";
      })

      /*
      |--------------------------------------------------------------------------
      | Change Password
      |--------------------------------------------------------------------------
      */

      .addCase(changePassword.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })

      .addCase(changePassword.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = null;
        state.message = action.payload.message;
      })

      .addCase(changePassword.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          action.payload?.message ||
          action.error.message ||
          "Password change failed.";
      })

      /*
      |--------------------------------------------------------------------------
      | Delete Account
      |--------------------------------------------------------------------------
      */

      .addCase(deleteAccount.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })

      .addCase(deleteAccount.fulfilled, (state, action) => {
        state.user = null;
        state.authChecked = true;
        state.isLoading = false;
        state.error = null;
        state.message = action.payload.message;
      })

      .addCase(deleteAccount.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          action.payload?.message ||
          action.error.message ||
          "Account deletion failed.";
      });
  },
});

/*
|--------------------------------------------------------------------------
| Actions
|--------------------------------------------------------------------------
*/

export const {
  clearAuthError,
  clearAuthMessage,
} = authSlice.actions;

/*
|--------------------------------------------------------------------------
| Selectors
|--------------------------------------------------------------------------
*/

export const selectAuth = (state) => state.auth;

export const selectUser = (state) =>
  state.auth.user;

export const selectAuthLoading = (state) =>
  state.auth.isLoading;

export const selectAuthChecked = (state) =>
  state.auth.authChecked;

export const selectAuthError = (state) =>
  state.auth.error;

export const selectAuthMessage = (state) =>
  state.auth.message;

export default authSlice.reducer;

export {
  getAllUsers,
  getUserById,
  updateAdminUser as adminUpdateUser,
  deleteAdminUser as adminDeleteUser,
  clearSelectedAdminUser as clearSelectedUser,
  clearAdminUsers as clearUsers,
  selectAdminUsers as selectUsers,
  selectSelectedAdminUser as selectSelectedUser,
  selectAdminUsersPagination as selectUserPagination,
} from "../adminDashboard/adminDashboardSlice.js";
