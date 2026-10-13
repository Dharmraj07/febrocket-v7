"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import {
  ArrowRight,
  Check,
  Clock3,
  FileText,
  FolderOpen,
  Keyboard,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { checkAuthSession, selectAuth } from "@/features/auth/authSlice";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
const GOOGLE_AUTH_URL =
  process.env.NEXT_PUBLIC_GOOGLE_AUTH_URL ||
  `${API_BASE_URL.replace(/\/+$/, "")}/api/auth/google`;

const steps = [
  {
    number: "01",
    icon: Upload,
    title: "Upload your documents",
    description: "Add the PDFs and images you already use for paperwork.",
  },
  {
    number: "02",
    icon: FolderOpen,
    title: "FebRocket keeps them together",
    description: "Your documents stay organized in one place in your account.",
  },
  {
    number: "03",
    icon: Search,
    title: "Find them when you need them",
    description: "Open your saved documents again when paperwork comes up.",
  },
];

export default function Home() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { authChecked, isLoading } = useSelector(selectAuth);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const menuTriggerRef = useRef(null);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      try {
        await dispatch(checkAuthSession()).unwrap();
        if (active) router.replace("/dashboard");
      } catch (error) {
        if (error?.status !== 401) {
          console.error("Failed to check authentication session:", error);
        }
      }
    };

    void checkSession();
    return () => {
      active = false;
    };
  }, [dispatch, router]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const trigger = menuTriggerRef.current;
    menuRef.current?.querySelector("a, button")?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        trigger?.focus();
        return;
      }
      if (event.key !== "Tab" || !menuRef.current) return;

      const focusable = menuRef.current.querySelectorAll(
        'a[href], button:not([disabled])'
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [menuOpen]);

  const startFree = () => {
    if (isLoading || !authChecked) return;
    window.location.assign(GOOGLE_AUTH_URL);
  };

  const closeMenu = () => setMenuOpen(false);
  const ctaLabel = isLoading || !authChecked ? "Checking your account…" : "Get Started Free";

  return (
    <main className="min-h-screen overflow-x-clip bg-white text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:h-[72px] sm:px-6 lg:px-8">
          <Link href="/" aria-label="FebRocket home" className="shrink-0">
            <Image
              src="/febrocket-logo7.png"
              alt="FebRocket"
              width={160}
              height={64}
              priority
              className="h-10 w-auto object-contain"
            />
          </Link>

          <nav className="hidden items-center gap-7 sm:flex" aria-label="Main navigation">
            <a
              href="#browser-extension"
              className="rounded-md px-2 py-2 text-sm font-medium text-slate-600 transition hover:text-slate-950 focus-visible:outline-offset-2"
            >
              Browser extension
            </a>
            <a
              href="#how-it-works"
              className="rounded-md px-2 py-2 text-sm font-medium text-slate-600 transition hover:text-slate-950 focus-visible:outline-offset-2"
            >
              How it works
            </a>
            <Link
              href="/privacy"
              className="rounded-md px-2 py-2 text-sm font-medium text-slate-600 transition hover:text-slate-950 focus-visible:outline-offset-2"
            >
              Privacy
            </Link>
            <button
              type="button"
              onClick={startFree}
              disabled={isLoading || !authChecked}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#2878f0] px-5 text-sm font-semibold text-white transition hover:bg-[#1e63d6] focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60"
            >
              {ctaLabel}
              {!isLoading && authChecked ? <ArrowRight size={16} aria-hidden="true" /> : null}
            </button>
          </nav>

          <button
            ref={menuTriggerRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition hover:bg-slate-50 focus-visible:outline-offset-2 sm:hidden"
          >
            {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
        {menuOpen ? (
          <>
            <div
              className="fixed inset-0 top-16 z-40 cursor-default bg-slate-950/20 sm:hidden"
              aria-hidden="true"
              onClick={closeMenu}
            />
            <nav
              id="mobile-navigation"
              ref={menuRef}
              role="dialog"
              aria-modal="true"
              aria-label="Main navigation"
              className="absolute inset-x-0 top-full z-50 grid gap-1 border-b border-slate-200 bg-white p-4 shadow-lg sm:hidden"
            >
              <a
                href="#browser-extension"
                onClick={closeMenu}
                className="flex min-h-12 items-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Browser extension
              </a>
              <a
                href="#how-it-works"
                onClick={closeMenu}
                className="flex min-h-12 items-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                How it works
              </a>
              <Link
                href="/privacy"
                onClick={closeMenu}
                className="flex min-h-12 items-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Privacy
              </Link>
              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  startFree();
                }}
                disabled={isLoading || !authChecked}
                className="mt-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#2878f0] px-4 text-sm font-semibold text-white hover:bg-[#1e63d6] disabled:opacity-60"
              >
                {ctaLabel}
                {!isLoading && authChecked ? <ArrowRight size={16} aria-hidden="true" /> : null}
              </button>
            </nav>
          </>
        ) : null}
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <p className="mb-5 text-sm font-semibold tracking-wide text-blue-700">
            A simpler place for your paperwork
          </p>
          <h1 className="text-[2.65rem] font-semibold leading-[1.07] tracking-[-0.045em] text-slate-950 sm:text-6xl lg:text-[4.25rem]">
            Your documents.
            <br className="hidden sm:block" /> Ready when you need them.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            Keep your important documents organized in one place and make
            paperwork easier.
          </p>
          <button
            type="button"
            onClick={startFree}
            disabled={isLoading || !authChecked}
            className="mt-8 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#2878f0] px-6 text-base font-semibold text-white shadow-sm transition hover:bg-[#1e63d6] focus-visible:outline-offset-4 disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:min-w-52"
          >
            {ctaLabel}
            {!isLoading && authChecked ? <ArrowRight size={18} aria-hidden="true" /> : null}
          </button>
          <p className="mt-3 text-sm text-slate-500">
            Create your free account with Google.
          </p>
          <p className="mt-6 inline-flex items-center gap-2 text-sm text-slate-600">
            <ShieldCheck size={17} className="text-slate-500" aria-hidden="true" />
            Read our <Link href="/privacy" className="font-medium text-blue-700 underline decoration-blue-200 underline-offset-4 hover:text-blue-800">privacy details</Link>.
          </p>
        </div>

        <DocumentPreviewIllustration />
      </section>

      <section
        id="browser-extension"
        aria-labelledby="extension-title"
        className="scroll-mt-20 border-y border-slate-100 bg-slate-50/70 px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      >
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-800">
              <Sparkles size={15} aria-hidden="true" />
              Coming Soon
            </p>
            <h2
              id="extension-title"
              className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl"
            >
              Let AI handle the repetitive parts of forms.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              The upcoming FebRocket browser extension will detect form fields,
              match them with information you have saved, and help fill them
              automatically. Review the matches and choose what to fill—you&apos;re
              always in control.
            </p>

            <ul className="mt-7 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <li className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700 ring-1 ring-slate-200">
                  <Keyboard size={17} aria-hidden="true" />
                </span>
                Less repetitive typing
              </li>
              <li className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700 ring-1 ring-slate-200">
                  <Clock3 size={17} aria-hidden="true" />
                </span>
                Faster form completion
              </li>
              <li className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700 ring-1 ring-slate-200">
                  <ShieldCheck size={17} aria-hidden="true" />
                </span>
                You choose what gets filled
              </li>
            </ul>
          </div>

          <ExtensionFormPreview />
        </div>
      </section>

      <section
        id="how-it-works"
        className="scroll-mt-20 border-y border-slate-100 bg-slate-50/70 px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      >
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-blue-700">HOW IT WORKS</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Paperwork, a little simpler.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Add your files once. Keep them together. Come back when you need them.
            </p>
          </div>

          <ol className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-3 sm:gap-5">
            {steps.map(({ number, icon: Icon, title, description }) => (
              <li
                key={number}
                className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <span className="text-xs font-semibold tracking-widest text-slate-400">{number}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-blue-700">MADE FOR EVERYDAY PAPERWORK</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Less searching. More getting on with your day.
            </h2>
          </div>
          <div className="mt-9 grid gap-3 sm:grid-cols-3 sm:gap-5">
            <Benefit title="One place" description="Keep the documents you use together in your account." />
            <Benefit title="Easy to revisit" description="Come back to your saved files when another form needs them." />
            <Benefit title="Free to start" description="Create an account and get your documents organized." />
          </div>
        </div>
      </section>

      <section className="bg-slate-50 px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between sm:p-9">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Make your next paperwork task easier.
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
              Start with a free account and keep your important documents together.
            </p>
          </div>
          <button
            type="button"
            onClick={startFree}
            disabled={isLoading || !authChecked}
            className="inline-flex min-h-14 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#2878f0] px-6 text-base font-semibold text-white transition hover:bg-[#1e63d6] focus-visible:outline-offset-4 disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:min-w-52"
          >
            {ctaLabel}
            {!isLoading && authChecked ? <ArrowRight size={18} aria-hidden="true" /> : null}
          </button>
        </div>
      </section>

      <footer className="border-t border-slate-100 bg-white px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/" aria-label="FebRocket home">
              <Image
                src="/febrocket-logo7.png"
                alt="FebRocket"
                width={144}
                height={58}
                className="h-9 w-auto object-contain"
              />
            </Link>
            <p className="mt-2 text-xs text-slate-500">A simpler place for your paperwork.</p>
          </div>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-slate-600">
            <Link className="min-h-10 py-2 hover:text-slate-950" href="/contact">Contact</Link>
            <Link className="min-h-10 py-2 hover:text-slate-950" href="/privacy">Privacy</Link>
            <Link className="min-h-10 py-2 hover:text-slate-950" href="/terms">Terms</Link>
            <Link className="min-h-10 py-2 hover:text-slate-950" href="/data-deletion">Data deletion</Link>
          </nav>
          <p className="text-xs text-slate-500">© 2026 FebRocket</p>
        </div>
      </footer>
    </main>
  );
}

function ExtensionFormPreview() {
  const detectedFields = [
    { label: "Full name", value: "Jordan Lee" },
    { label: "Email address", value: "jordan@example.com" },
    { label: "Phone number", value: "(555) 010-2048" },
  ];

  return (
    <div
      className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_70px_-45px_rgba(15,23,42,0.32)]"
      role="img"
      aria-label="Illustration: the extension detects name, email, and phone fields, matches them with saved profile information, and lets you review before filling."
    >
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <div className="ml-2 min-w-0 flex-1 truncate rounded-md bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
          example.com / create-account
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">Create an account</p>
            <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
              Website form
            </span>
          </div>
          <div className="mt-4 grid gap-3">
            {detectedFields.map(({ label, value }) => (
              <div key={label}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-slate-600">{label}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-blue-700">
                    <Sparkles size={11} aria-hidden="true" />
                    Detected
                  </span>
                </div>
                <div className="truncate rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs text-slate-500">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Sparkles size={16} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">FebRocket AI</p>
              <p className="text-[11px] text-slate-500">Saved information match</p>
            </div>
          </div>

          <ul className="mt-4 grid gap-2">
            {detectedFields.map(({ label, value }) => (
              <li
                key={label}
                className="flex min-w-0 items-center gap-2 rounded-lg border border-white bg-white px-2.5 py-2"
              >
                <Check size={14} className="shrink-0 text-emerald-600" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-700">{value}</span>
                <span className="shrink-0 text-[10px] text-slate-400">Matched</span>
              </li>
            ))}
          </ul>

          <div className="mt-3 rounded-lg bg-white px-3 py-2.5 text-center text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
            Review matches before filling
          </div>
        </div>
      </div>
      <div className="border-t border-slate-100 px-4 py-3 text-center text-[11px] text-slate-500">
        Preview only · You decide what to autofill
      </div>
    </div>
  );
}

function DocumentPreviewIllustration() {
  const documents = [
    { icon: FileText, title: "Personal document", type: "PDF document" },
    { icon: FileText, title: "Certificate", type: "Image document" },
    { icon: FileText, title: "Other paperwork", type: "PDF document" },
  ];

  return (
    <div
      className="mx-auto w-full max-w-lg rounded-[1.75rem] border border-slate-200 bg-slate-50 p-4 shadow-[0_20px_70px_-45px_rgba(15,23,42,0.32)] sm:p-7"
      aria-label="Illustration of documents kept together"
      role="img"
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <p className="text-xs font-medium text-slate-500">YOUR FILES</p>
            <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Your documents</p>
          </div>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <FolderOpen size={20} aria-hidden="true" />
          </span>
        </div>
        <ul className="mt-2 divide-y divide-slate-100">
          {documents.map(({ icon: Icon, title, type }) => (
            <li key={title} className="flex min-w-0 items-center gap-3 py-4">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800">{title}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{type}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-sm font-medium text-blue-800">
          <FolderOpen size={16} aria-hidden="true" />
          Together in one place
        </p>
      </div>
    </div>
  );
}

function Benefit({ title, description }) {
  return (
    <article className="rounded-2xl bg-slate-50 p-5 sm:p-6">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </article>
  );
}
