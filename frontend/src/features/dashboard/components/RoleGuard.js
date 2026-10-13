"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { checkAuthSession, selectAuth } from "@/features/auth/authSlice";
import { RefreshCw } from "lucide-react";
import DashboardLoading from "./DashboardLoading";
import { getDashboardRoute, getUserRole } from "../dashboardRoles";

export default function RoleGuard({ role, children }) {
  const dispatch = useDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const { user, authChecked, authCheckStatus } = useSelector(selectAuth);
  const [authorized, setAuthorized] = useState(false);
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false);
  const [retryingSessionCheck, setRetryingSessionCheck] = useState(false);
  const isUserAccountRoute =
    role === "user" && ["/support", "/settings"].includes(pathname);

  useEffect(() => {
    let active = true;

    const authorize = async () => {
      if (retryingSessionCheck) return;
      let sessionUser = user;

      if (!authChecked) {
        try {
          sessionUser = await dispatch(checkAuthSession()).unwrap();
        } catch (error) {
          if (error?.status === 401) {
            if (active) router.replace("/");
          } else if (active) {
            setSessionCheckFailed(true);
          }
          return;
        }
      }

      if (!active) {
        return;
      }

      if (!sessionUser && authCheckStatus !== null && authCheckStatus !== 401) {
        setSessionCheckFailed(true);
        return;
      }

      if (!sessionUser) {
        router.replace("/");
        return;
      }

      setSessionCheckFailed(false);
      if (getUserRole(sessionUser) !== role) {
        router.replace(getDashboardRoute(sessionUser));
        return;
      }

      setAuthorized(
        pathname === getDashboardRoute(sessionUser) ||
          (role === "user" && pathname === "/dashboard") ||
          isUserAccountRoute
      );
    };

    void authorize();

    return () => {
      active = false;
    };
  }, [
    authCheckStatus,
    authChecked,
    dispatch,
    isUserAccountRoute,
    pathname,
    retryingSessionCheck,
    role,
    router,
    user,
  ]);

  const retrySessionCheck = async () => {
    setRetryingSessionCheck(true);
    setSessionCheckFailed(false);
    try {
      await dispatch(checkAuthSession()).unwrap();
    } catch (error) {
      if (error?.status === 401) {
        router.replace("/");
      } else {
        setSessionCheckFailed(true);
      }
    } finally {
      setRetryingSessionCheck(false);
    }
  };

  if (sessionCheckFailed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <section className="max-w-md text-center" role="alert">
          <h1 className="text-lg font-semibold text-slate-900">
            We couldn&apos;t verify your session
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            You may still be signed in. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={retrySessionCheck}
            disabled={retryingSessionCheck}
            className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw
              size={16}
              className={retryingSessionCheck ? "animate-spin" : ""}
              aria-hidden="true"
            />
            {retryingSessionCheck ? "Checking…" : "Try again"}
          </button>
        </section>
      </main>
    );
  }

  if (
    !authorized ||
    !authChecked ||
    !user ||
    getUserRole(user) !== role ||
    (pathname !== getDashboardRoute(user) &&
      !(role === "user" && pathname === "/dashboard") &&
      !isUserAccountRoute)
  ) {
    return <DashboardLoading />;
  }

  return children;
}
