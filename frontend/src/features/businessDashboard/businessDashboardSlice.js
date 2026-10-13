import { createSlice } from "@reduxjs/toolkit";

const businessDashboardSlice = createSlice({
  name: "businessDashboard",
  initialState: {
    stage: "future",
  },
  reducers: {},
});

export const selectBusinessDashboard = (state) => state.businessDashboard;

export default businessDashboardSlice.reducer;
