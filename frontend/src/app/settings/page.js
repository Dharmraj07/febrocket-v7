"use client";

import { useState } from "react";
import {
  ChevronDown,
  CircleUserRound,
  KeyRound,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import {
  changePassword,
  deleteAccount,
  selectAuth,
  updateProfile,
} from "@/features/auth/authSlice";
import RoleGuard from "@/features/dashboard/components/RoleGuard";
import UserWorkspaceShell from "@/features/dashboard/components/UserWorkspaceShell";
import ProfileAvatar from "@/components/ProfileAvatar";

function SettingsDisclosure({ icon: Icon, title, description, children, destructive = false }) {
  return (
    <details className="group border-b border-slate-100 last:border-b-0">
      <summary className="flex min-h-[68px] cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${destructive ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-600"}`}>
          <Icon size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-semibold ${destructive ? "text-rose-700" : "text-slate-900"}`}>
            {title}
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-slate-500">{description}</span>
        </span>
        <ChevronDown size={18} className="shrink-0 text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="pb-5 pl-[52px] pr-1 sm:pl-[52px]">{children}</div>
    </details>
  );
}

export default function SettingsPage() {
  const dispatch = useDispatch();
  const router = useRouter();
  const { user } = useSelector(selectAuth);
  const [profileOpen, setProfileOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const handleProfileUpdate = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setFeedback(null);
    try {
      await dispatch(
        updateProfile({
          userName: String(formData.get("userName") || "").trim(),
          email: String(formData.get("email") || "").trim(),
        })
      ).unwrap();
      setFeedback({ type: "success", text: "Your profile has been updated." });
      setProfileOpen(false);
    } catch {
      setFeedback({ type: "error", text: "We couldn't update your profile. Please check your details and try again." });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const oldPassword = String(formData.get("oldPassword") || "");
    const newPassword = String(formData.get("newPassword") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");
    if (newPassword.length < 8) {
      setFeedback({ type: "error", text: "Your new password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedback({ type: "error", text: "The new passwords don't match." });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      await dispatch(changePassword({ oldPassword, newPassword })).unwrap();
      form.reset();
      setSecurityOpen(false);
      setFeedback({ type: "success", text: "Your password has been changed." });
    } catch {
      setFeedback({ type: "error", text: "We couldn't change your password. Check your current password and try again." });
    } finally {
      setSaving(false);
    }
  };

  const handleAccountDeletion = async () => {
    if (deleteConfirmation !== "DELETE") return;
    setSaving(true);
    setFeedback(null);
    try {
      await dispatch(deleteAccount()).unwrap();
      router.replace("/");
    } catch {
      setFeedback({ type: "error", text: "We couldn't delete your account. Please try again." });
      setSaving(false);
    }
  };

  return (
    <RoleGuard role="user">
      <UserWorkspaceShell user={user}>
        <div className="mx-auto max-w-[920px] px-4 pb-10 pt-7 sm:px-8 lg:px-10 lg:pt-9">
          <header className="mb-6 sm:mb-8">
            <p className="text-sm font-medium text-blue-700">Account</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Settings</h1>
            <p className="mt-2 text-base leading-6 text-slate-600">
              Manage your profile and account security.
            </p>
          </header>

          {feedback && (
            <p
              className={`mb-5 rounded-xl px-4 py-3 text-sm ${feedback.type === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"}`}
              role={feedback.type === "error" ? "alert" : "status"}
            >
              {feedback.text}
            </p>
          )}

          <div className="space-y-0 sm:space-y-5">
            <section id="profile" aria-labelledby="profile-heading" className="scroll-mt-20 rounded-none border-0 border-b border-slate-200 bg-transparent px-0 py-4 sm:rounded-2xl sm:border sm:bg-white sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2878f0]">
                  <CircleUserRound size={20} />
                </span>
                <div>
                  <h2 id="profile-heading" className="font-semibold text-slate-950">Profile</h2>
                  <p className="text-sm text-slate-500">Your personal information</p>
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-center">
                <ProfileAvatar
                  profilePicture={user?.profilePicture}
                  className="h-14 w-14 bg-blue-100 text-[#2878f0]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {user?.userName || user?.name || "Your profile"}
                  </p>
                  <p className="truncate text-sm text-slate-500">{user?.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen((open) => !open);
                    setFeedback(null);
                  }}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#2878f0] px-4 text-sm font-semibold text-white transition hover:bg-[#1e63d6]"
                >
                  {profileOpen ? "Cancel" : "Edit Profile"}
                </button>
              </div>
              {profileOpen && (
                <form onSubmit={handleProfileUpdate} className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Name
                    <input
                      name="userName"
                      type="text"
                      required
                      minLength={3}
                      maxLength={30}
                      defaultValue={user?.userName || user?.name || ""}
                      autoComplete="username"
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-base text-slate-900 outline-none focus:border-[#2878f0] focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Email
                    <input
                      name="email"
                      type="email"
                      required
                      defaultValue={user?.email || ""}
                      autoComplete="email"
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-base text-slate-900 outline-none focus:border-[#2878f0] focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={saving}
                    className="min-h-11 w-full rounded-xl bg-[#2878f0] px-4 text-sm font-semibold text-white hover:bg-[#1e63d6] disabled:opacity-60 sm:w-auto sm:col-span-2"
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </form>
              )}
            </section>

            <section aria-labelledby="security-heading" className="rounded-none border-0 border-b border-slate-200 bg-transparent px-0 py-4 sm:rounded-2xl sm:border sm:bg-white sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#2878f0]">
                  <KeyRound size={20} />
                </span>
                <div>
                  <h2 id="security-heading" className="font-semibold text-slate-950">Security</h2>
                  <p className="text-sm text-slate-500">Keep your account secure</p>
                </div>
              </div>
              <div className="mt-5">
                <SettingsDisclosure icon={KeyRound} title="Change password" description="Update your sign-in password">
                  <button
                    type="button"
                    onClick={() => {
                      setSecurityOpen((open) => !open);
                      setFeedback(null);
                    }}
                    className="mb-3 inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    {securityOpen ? "Cancel" : "Change Password"}
                  </button>
                  {securityOpen && (
                    <form onSubmit={handlePasswordChange} className="space-y-3">
                      <label className="block text-sm font-medium text-slate-700">
                        Current password
                        <input name="oldPassword" type="password" required autoComplete="current-password" className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-base outline-none focus:border-[#2878f0] focus:ring-2 focus:ring-blue-100" />
                      </label>
                      <label className="block text-sm font-medium text-slate-700">
                        New password
                        <input name="newPassword" type="password" required minLength={8} autoComplete="new-password" className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-base outline-none focus:border-[#2878f0] focus:ring-2 focus:ring-blue-100" />
                      </label>
                      <label className="block text-sm font-medium text-slate-700">
                        Confirm new password
                        <input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-base outline-none focus:border-[#2878f0] focus:ring-2 focus:ring-blue-100" />
                      </label>
                      <button type="submit" disabled={saving} className="min-h-11 w-full rounded-xl bg-[#2878f0] px-4 text-sm font-semibold text-white hover:bg-[#1e63d6] disabled:opacity-60 sm:w-auto">
                        {saving ? "Saving…" : "Save password"}
                      </button>
                    </form>
                  )}
                </SettingsDisclosure>
              </div>
            </section>

            <section aria-labelledby="danger-heading" className="rounded-none border-0 border-b border-rose-100 bg-transparent px-0 py-4 sm:rounded-2xl sm:border sm:bg-white sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <Trash2 size={19} />
                </span>
                <div>
                  <h2 id="danger-heading" className="font-semibold text-slate-900">Danger Zone</h2>
                  <p className="text-sm text-slate-500">Permanently remove your account and documents.</p>
                </div>
              </div>
              <div className="mt-4 border-t border-rose-100 pt-4">
                {!deleteOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteOpen(true);
                      setDeleteConfirmation("");
                      setFeedback(null);
                    }}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                  >
                    <Trash2 size={16} />
                    Delete Account
                  </button>
                ) : (
                  <div className="max-w-lg">
                    <p className="text-sm leading-6 text-slate-700">
                      This cannot be undone. Type <strong className="text-rose-700">DELETE</strong> to confirm.
                    </p>
                    <input
                      type="text"
                      value={deleteConfirmation}
                      onChange={(event) => setDeleteConfirmation(event.target.value)}
                      autoComplete="off"
                      aria-label="Type DELETE to confirm account deletion"
                      className="mt-3 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-base outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setDeleteOpen(false)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Cancel
                      </button>
                      <button type="button" onClick={handleAccountDeletion} disabled={deleteConfirmation !== "DELETE" || saving} className="min-h-11 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50">
                        {saving ? "Deleting…" : "Confirm deletion"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </UserWorkspaceShell>
    </RoleGuard>
  );
}
