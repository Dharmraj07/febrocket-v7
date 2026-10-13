import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  activeSection: "overview",
};

const userDashboardSlice = createSlice({
  name: "userDashboard",
  initialState,
  reducers: {
    setUserDashboardSection: (state, action) => {
      state.activeSection = action.payload;
    },
  },
});

export const { setUserDashboardSection } = userDashboardSlice.actions;
export const selectUserDashboard = (state) => state.userDashboard;

export default userDashboardSlice.reducer;
