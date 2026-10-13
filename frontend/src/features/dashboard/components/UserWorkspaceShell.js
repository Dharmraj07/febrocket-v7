"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import {
  ChevronRight,
  FileText,
  FolderOpen,
  Heart,
  LogOut,
  Menu,
  Settings,
  X,
} from "lucide-react";
import { logoutUser } from "@/features/auth/authSlice";
import ProfileAvatar from "@/components/ProfileAvatar";

export default function UserWorkspaceShell({
  user,
  children,
  onAllDocuments,
  onLibrary,
  activeView = "browse",
}) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useDispatch();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const displayName = user?.userName || user?.name || user?.email || "User";
  const isDashboard = pathname === "/dashboard/user" || pathname === "/dashboard";

  useEffect(() => {
    if (!menuOpen) return undefined;

    const originalOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.body.style.overflow = "hidden";
    menuRef.current?.focus();
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    try {
      await dispatch(logoutUser()).unwrap();
    } catch (error) {
      console.error("Failed to log out:", error);
    } finally {
      router.replace("/");
    }
  };

  const handleAction = (callback) => {
    setMenuOpen(false);
    callback?.();
  };

  const handleAllDocuments = () => {
    if (onAllDocuments) {
      handleAction(onAllDocuments);
      return;
    }
    router.push("/dashboard/user");
    setMenuOpen(false);
  };

  const handleLibrary = () => {
    if (onLibrary) {
      handleAction(onLibrary);
      return;
    }
    router.push("/dashboard/user");
    setMenuOpen(false);
  };

  const desktopNavClass = (active = false) =>
    `flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition ${
      active
        ? "bg-blue-50 text-blue-700"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
    }`;

  const mobileNavClass =
    "flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50";

  const trapMenuFocus = (event) => {
    if (event.key !== "Tab") return;

    const focusableElements = event.currentTarget.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusableElements.length) return;

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[220px] flex-col border-r border-slate-100 bg-white px-3 py-5 lg:flex">
        <Link href="/" className="flex items-center gap-2 px-3" aria-label="FebRocket home">
          <Image
            src="/febrocket-logo7.png"
            alt="FebRocket — Future Forward"
            width={160}
            height={64}
            className="h-10 w-auto object-contain"
            priority
          />
        </Link>

        <nav className="mt-8 space-y-1" aria-label="Main navigation">
          <button
            type="button"
            onClick={handleAllDocuments}
            aria-current={isDashboard && activeView === "browse" ? "page" : undefined}
            className={desktopNavClass(isDashboard && activeView === "browse")}
          >
            <FileText size={18} />
            Documents
          </button>
          <button
            type="button"
            onClick={handleLibrary}
            aria-current={isDashboard && activeView === "organize" ? "page" : undefined}
            className={desktopNavClass(isDashboard && activeView === "organize")}
          >
            <FolderOpen size={18} />
            Library
          </button>
          <Link
            href="/support"
            className={`${desktopNavClass(pathname === "/support")} mt-2 ${
              pathname === "/support" ? "bg-emerald-50 text-emerald-800" : "hover:bg-emerald-50 hover:text-emerald-800"
            }`}
          >
            <Heart size={18} />
            Support
          </Link>
        </nav>

        <div className="mt-auto space-y-3 border-t border-slate-100 pt-4">
          <Link
            href="/settings"
            className={desktopNavClass(pathname === "/settings")}
            aria-current={pathname === "/settings" ? "page" : undefined}
          >
            <Settings size={18} />
            Settings
          </Link>
          <div className="flex min-w-0 items-center gap-3 rounded-xl px-2 py-2">
            <ProfileAvatar
              profilePicture={user?.profilePicture}
              className="h-9 w-9"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-800">{displayName}</span>
              <span className="block text-xs text-slate-500">Personal workspace</span>
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-slate-600 transition hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-offset-2"
          >
            <LogOut size={18} />
            Log out
          </button>
        </div>
      </aside>

      <main className="min-h-screen min-w-0 flex-1 lg:ml-[220px]">
        <header className="sticky top-0 z-30 h-16 border-b border-slate-100 bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-4 sm:px-6 lg:justify-end lg:px-8">
            <Link href="/" className="flex items-center gap-2 lg:hidden" aria-label="FebRocket home">
              <Image
                src="/febrocket-logo7.png"
                alt="FebRocket"
                width={144}
                height={58}
                className="h-9 w-auto object-contain"
                priority
              />
            </Link>
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setMenuOpen(true)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 focus-visible:outline-offset-2 lg:hidden"
              aria-label="Open navigation menu"
              aria-expanded={menuOpen}
            >
              <Menu size={20} />
            </button>
          </div>
        </header>

        {children}
      </main>

      {menuOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-slate-950/35"
            aria-label="Close navigation menu"
            onClick={() => setMenuOpen(false)}
          />
          <aside
            ref={menuRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-menu-heading"
            onKeyDown={trapMenuFocus}
            className="fixed inset-y-0 right-0 z-50 flex w-[min(88vw,360px)] flex-col overflow-y-auto overscroll-contain border-l border-slate-200 bg-white p-4 shadow-xl outline-none sm:p-5"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <ProfileAvatar
                  profilePicture={user?.profilePicture}
                  className="h-11 w-11"
                />
                <div className="min-w-0">
                  <p id="workspace-menu-heading" className="truncate text-sm font-semibold text-slate-900">
                    {displayName}
                  </p>
                  <p className="truncate text-xs text-slate-500">{user?.email || "Personal workspace"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                aria-label="Close navigation menu"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="mt-4 flex-1 space-y-1" aria-label="Mobile navigation">
              <button type="button" onClick={handleAllDocuments} className={mobileNavClass}>
                <span className="flex items-center gap-3"><FileText size={18} />Documents</span>
                <ChevronRight size={17} className="text-slate-400" />
              </button>
              <button type="button" onClick={handleLibrary} className={mobileNavClass}>
                <span className="flex items-center gap-3"><FolderOpen size={18} />Library</span>
                <ChevronRight size={17} className="text-slate-400" />
              </button>
              <Link
                href="/support"
                onClick={() => setMenuOpen(false)}
                className={`${mobileNavClass} ${pathname === "/support" ? "bg-emerald-50 text-emerald-800" : ""}`}
              >
                <span className="flex items-center gap-3"><Heart size={18} />Support</span>
                <ChevronRight size={17} className="text-slate-400" />
              </Link>
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className={`${mobileNavClass} ${pathname === "/settings" ? "bg-blue-50 text-blue-700" : ""}`}
              >
                <span className="flex items-center gap-3"><Settings size={18} />Settings</span>
                <ChevronRight size={17} className="text-slate-400" />
              </Link>
            </nav>

            <div className="border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={handleLogout}
                className="flex min-h-12 w-full items-center justify-between rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Log Out
                <LogOut size={17} />
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
