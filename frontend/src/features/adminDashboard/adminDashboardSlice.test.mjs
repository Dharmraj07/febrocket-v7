import test from "node:test";
import assert from "node:assert/strict";

import { configureStore } from "@reduxjs/toolkit";
import { api } from "../../lib/api.js";
import authReducer from "../auth/authSlice.js";
import adminDashboardReducer, { getAllUsers } from "./adminDashboardSlice.js";
import businessDashboardReducer from "../businessDashboard/businessDashboardSlice.js";
import userDashboardReducer from "../userDashboard/userDashboardSlice.js";

test("admin user data is stored separately from auth and other dashboards", async () => {
  const originalGet = api.get;
  let request;
  api.get = async (...args) => {
    request = args;
    return {
      data: {
        users: [{ id: "user-1", userName: "Ada" }],
        totalUsers: 1,
      },
    };
  };

  try {
    const store = configureStore({
      reducer: {
        auth: authReducer,
        adminDashboard: adminDashboardReducer,
        userDashboard: userDashboardReducer,
        businessDashboard: businessDashboardReducer,
      },
    });
    store.dispatch({
      type: "auth/checkAuthSession/fulfilled",
      payload: { id: "admin-1", role: "admin" },
    });

    await store.dispatch(getAllUsers()).unwrap();

    const state = store.getState();
    assert.deepEqual(state.adminDashboard.users, [
      { id: "user-1", userName: "Ada" },
    ]);
    assert.equal(state.auth.user.id, "admin-1");
    assert.equal("users" in state.auth, false);
    assert.deepEqual(state.userDashboard, { activeSection: "overview" });
    assert.deepEqual(state.businessDashboard, { stage: "future" });
    assert.equal(request[0], "/api/auth/admin/users");
    assert.deepEqual(
      {
        params: request[1].params,
        withCredentials: request[1].withCredentials,
      },
      {
        params: { page: 1, limit: 10, search: "" },
        withCredentials: true,
      }
    );
    assert.equal(request[1].signal instanceof AbortSignal, true);
  } finally {
    api.get = originalGet;
  }
});
