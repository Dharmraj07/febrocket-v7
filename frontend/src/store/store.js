import { combineReducers, configureStore } from "@reduxjs/toolkit";
import authReducer, {
  deleteAccount,
  logoutUser,
  remoteLogout,
} from "@/features/auth/authSlice";
import adminDashboardReducer from "@/features/adminDashboard/adminDashboardSlice";
import businessDashboardReducer from "@/features/businessDashboard/businessDashboardSlice";
import userDashboardReducer from "@/features/userDashboard/userDashboardSlice";
import documentReducer from "@/features/document/documentSlice";

const combinedReducer = combineReducers({
  auth: authReducer,
  userDashboard: userDashboardReducer,
  adminDashboard: adminDashboardReducer,
  businessDashboard: businessDashboardReducer,
  documents: documentReducer,
});

const protectedFeaturePrefixes = [
  "userDashboard/",
  "adminDashboard/",
  "businessDashboard/",
  "documents/",
];

function rootReducer(state, action) {
  if (
    remoteLogout.match(action) ||
    logoutUser.fulfilled.match(action) ||
    logoutUser.rejected.match(action) ||
    deleteAccount.fulfilled.match(action)
  ) {
    return combinedReducer(undefined, action);
  }

  if (
    state?.auth &&
    !state.auth.user &&
    protectedFeaturePrefixes.some((prefix) => action.type.startsWith(prefix))
  ) {
    return state;
  }

  return combinedReducer(state, action);
}

export const store = configureStore({ reducer: rootReducer });
