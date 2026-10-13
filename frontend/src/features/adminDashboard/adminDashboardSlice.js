import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { api } from "../../lib/api.js";

const initialState = {
  users: [],
  usersRequestId: null,
  selectedUser: null,
  selectedUserRequestId: null,
  pagination: {
    count: 0,
    totalUsers: 0,
    totalPages: 0,
    currentPage: 1,
    limit: 10,
    search: "",
    hasNextPage: false,
    hasPreviousPage: false,
  },
  isLoading: false,
  error: null,
  message: null,
};

function getUserFromPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  return payload.user || payload.data?.user || null;
}

function getErrorPayload(error, fallbackMessage) {
  return {
    message:
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      fallbackMessage,
    status: error?.response?.status ?? null,
  };
}

function getSuccessMessage(response, fallbackMessage = null) {
  return response?.data?.message || fallbackMessage;
}

export const getAllUsers = createAsyncThunk(
  "adminDashboard/getAllUsers",
  async ({ page = 1, limit = 10, search = "" } = {}, { rejectWithValue, signal }) => {
    try {
      const response = await api.get("/api/auth/admin/users", {
        params: { page, limit, search },
        withCredentials: true,
        signal,
      });

      return response.data;
    } catch (error) {
      return rejectWithValue(getErrorPayload(error, "Failed to fetch users."));
    }
  }
);

export const getUserById = createAsyncThunk(
  "adminDashboard/getUserById",
  async (userId, { rejectWithValue, signal }) => {
    try {
      const response = await api.get(`/api/auth/admin/users/${userId}`, {
        withCredentials: true,
        signal,
      });

      return {
        user: getUserFromPayload(response.data),
        message: getSuccessMessage(response),
      };
    } catch (error) {
      return rejectWithValue(getErrorPayload(error, "Failed to fetch user."));
    }
  }
);

export const updateAdminUser = createAsyncThunk(
  "adminDashboard/updateUser",
  async ({ userId, userData }, { rejectWithValue }) => {
    try {
      const response = await api.put(
        `/api/auth/admin/users/${userId}`,
        userData,
        { withCredentials: true }
      );

      return {
        user: getUserFromPayload(response.data),
        message: getSuccessMessage(response, "User updated successfully."),
      };
    } catch (error) {
      return rejectWithValue(getErrorPayload(error, "Failed to update user."));
    }
  }
);

export const deleteAdminUser = createAsyncThunk(
  "adminDashboard/deleteUser",
  async (userId, { rejectWithValue }) => {
    try {
      const response = await api.delete(`/api/auth/admin/users/${userId}`, {
        withCredentials: true,
      });

      return {
        userId,
        message: getSuccessMessage(response, "User deleted successfully."),
      };
    } catch (error) {
      return rejectWithValue(getErrorPayload(error, "Failed to delete user."));
    }
  }
);

const adminDashboardSlice = createSlice({
  name: "adminDashboard",
  initialState,
  reducers: {
    clearAdminDashboardError: (state) => {
      state.error = null;
    },
    clearAdminDashboardMessage: (state) => {
      state.message = null;
    },
    clearSelectedAdminUser: (state) => {
      state.selectedUser = null;
    },
    clearAdminUsers: (state) => {
      state.users = [];
      state.usersRequestId = null;
      state.selectedUser = null;
      state.selectedUserRequestId = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getAllUsers.pending, (state, action) => {
        state.usersRequestId = action.meta.requestId;
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getAllUsers.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.usersRequestId) return;
        state.usersRequestId = null;
        state.isLoading = false;
        state.error = null;
        const payload = action.payload || {};
        state.users = Array.isArray(payload.users) ? payload.users : [];
        state.pagination = {
          count: payload.count || 0,
          totalUsers: payload.totalUsers || 0,
          totalPages: payload.totalPages || 0,
          currentPage: payload.currentPage || 1,
          limit: payload.limit || 10,
          search: payload.search || "",
          hasNextPage: Boolean(payload.hasNextPage),
          hasPreviousPage: Boolean(payload.hasPreviousPage),
        };
      })
      .addCase(getAllUsers.rejected, (state, action) => {
        if (action.meta.requestId !== state.usersRequestId) return;
        state.usersRequestId = null;
        state.isLoading = false;
        state.error =
          action.payload?.message ||
          action.error.message ||
          "Failed to fetch users.";
      })
      .addCase(getUserById.pending, (state, action) => {
        state.selectedUserRequestId = action.meta.requestId;
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getUserById.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.selectedUserRequestId) return;
        state.selectedUserRequestId = null;
        state.isLoading = false;
        state.error = null;
        state.selectedUser = action.payload.user;
      })
      .addCase(getUserById.rejected, (state, action) => {
        if (action.meta.requestId !== state.selectedUserRequestId) return;
        state.selectedUserRequestId = null;
        state.isLoading = false;
        state.error =
          action.payload?.message ||
          action.error.message ||
          "Failed to fetch user.";
      })
      .addCase(updateAdminUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(updateAdminUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = null;
        state.message = action.payload.message;
        state.selectedUser = action.payload.user;
        const updatedId =
          action.payload.user?._id || action.payload.user?.id;
        const index = state.users.findIndex(
          (user) => String(user._id || user.id) === String(updatedId)
        );

        if (index !== -1 && action.payload.user) {
          state.users[index] = action.payload.user;
        }
      })
      .addCase(updateAdminUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          action.payload?.message ||
          action.error.message ||
          "Failed to update user.";
      })
      .addCase(deleteAdminUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(deleteAdminUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = null;
        state.message = action.payload.message;
        state.users = state.users.filter(
          (user) => String(user._id || user.id) !== String(action.payload.userId)
        );

        if (
          state.selectedUser &&
          String(state.selectedUser._id || state.selectedUser.id) ===
            String(action.payload.userId)
        ) {
          state.selectedUser = null;
        }

        if (state.pagination.totalUsers > 0) {
          state.pagination.totalUsers -= 1;
        }
      })
      .addCase(deleteAdminUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          action.payload?.message ||
          action.error.message ||
          "Failed to delete user.";
      });
  },
});

export const {
  clearAdminDashboardError,
  clearAdminDashboardMessage,
  clearAdminUsers,
  clearSelectedAdminUser,
} = adminDashboardSlice.actions;

export const selectAdminDashboard = (state) => state.adminDashboard;
export const selectAdminUsers = (state) => state.adminDashboard.users;
export const selectSelectedAdminUser = (state) =>
  state.adminDashboard.selectedUser;
export const selectAdminUsersPagination = (state) =>
  state.adminDashboard.pagination;

export default adminDashboardSlice.reducer;
