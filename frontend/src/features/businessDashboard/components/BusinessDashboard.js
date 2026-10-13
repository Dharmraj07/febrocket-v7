"use client";

import { useDispatch, useSelector } from "react-redux";
import Link from "next/link";
import { LogOut, Store } from "lucide-react";
import { logoutUser, selectAuth } from "@/features/auth/authSlice";
import { selectBusinessDashboard } from "@/features/businessDashboard/businessDashboardSlice";

export default function BusinessDashboard() {
  const dispatch = useDispatch();
  const { user } = useSelector(selectAuth);
  const businessDashboard = useSelector(selectBusinessDashboard);
  const displayName =
    user?.businessName || user?.userName || user?.name || user?.email || "Business";

  const handleLogout = async () => {
    try {
      await dispatch(logoutUser()).unwrap();
    } catch (error) {
      console.error("Failed to log out:", error);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/dashboard/business"
            className="flex items-center gap-3 font-semibold text-slate-900"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Store size={18} />
            </span>
            Business Workspace
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div
          data-dashboard-status={businessDashboard.stage}
          className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-9"
        >
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Welcome, {displayName}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            Your business workspace is ready. There are no business tools or data here yet.
          </p>
          <div className="mt-6 border-t border-slate-100 pt-5 text-sm text-slate-500">
            This workspace is separate from your personal documents.
          </div>
        </div>
      </section>
    </main>
  );
}
