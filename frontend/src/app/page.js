"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileText,
  FolderOpen,
  LockKeyhole,
  Menu,
  PanelTop,
  Sparkles,
  Upload,
  UserRound,
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
    title: "Upload",
    description: "Add the personal documents you already use for paperwork.",
    example: "Identity card.pdf",
    exampleIcon: FileText,
  },
  {
    number: "02",
    icon: Sparkles,
    title: "Extract",
    description: "AI reads your documents and pulls out useful details.",
    example: "Name · Date of birth · Address",
    exampleIcon: ClipboardCheck,
  },
  {
    number: "03",
    icon: FolderOpen,
    title: "Organize",
    description: "Keep documents and extracted information in your library.",
    example: "Personal · 3 documents",
    exampleIcon: UserRound,
  },
  {
    number: "04",
    icon: PanelTop,
    title: "Autofill",
    description: "Use the upcoming extension to match, review, and fill website forms.",
    example: "3 form fields matched",
    exampleIcon: Check,
  },
];

const features = [
  {
    icon: FolderOpen,
    title: "Document storage",
    description: "Keep the files you choose to upload together in your account.",
  },
  {
    icon: Sparkles,
    title: "AI information extraction",
    description: "Turn document contents into details you can find and reuse.",
  },
  {
    icon: UserRound,
    title: "People-based library",
    description: "Group documents and extracted information by person.",
  },
  {
    icon: PanelTop,
    title: "Browser extension · Coming soon",
    description: "Find matches for website fields and fill the details you select.",
  },
  {
    icon: FileText,
    title: "Document matching",
    description: "Match relevant saved documents to form fields that request an upload.",
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
  const ctaLabel = isLoading || !authChecked ? "Checking your account…" : "Get Started";

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

      <section className="relative isolate overflow-hidden bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/50 px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20 lg:px-8 lg:pb-24 lg:pt-24">
        <div className="pointer-events-none absolute -right-32 -top-36 -z-10 h-96 w-96 rounded-full bg-blue-100/50 blur-3xl" />
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-3 py-1.5 text-sm font-medium text-blue-800">
              <Sparkles size={15} aria-hidden="true" />
              Documents in. Busywork out.
            </p>
            <h1 className="text-[2.6rem] font-semibold leading-[1.06] tracking-[-0.045em] text-slate-950 sm:text-6xl lg:text-7xl">
              Your Documents.
              <br className="hidden sm:block" /> Ready for Every Form.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              Upload your documents once. AI extracts and organizes your
              information, and FebRocket helps fill repetitive online forms
              faster.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={startFree}
                disabled={isLoading || !authChecked}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2878f0] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1e63d6] focus-visible:outline-offset-4 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
              >
                {ctaLabel}
                {!isLoading && authChecked ? <ArrowRight size={17} aria-hidden="true" /> : null}
              </button>
              <a
                href="#how-it-works"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-offset-4"
              >
                See How It Works
                <ChevronRight size={17} aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="mt-12 sm:mt-16 lg:mt-20">
            <ProductWorkflowPreview />
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        aria-labelledby="how-it-works-title"
        className="scroll-mt-20 border-y border-slate-100 bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-blue-700">HOW IT WORKS</p>
            <h2 id="how-it-works-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              From documents to done, in four steps.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Build a personal library once, then use the information when forms come up.
            </p>
          </div>

          <ol className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ number, icon: Icon, title, description, example, exampleIcon: ExampleIcon }) => (
              <li
                key={number}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-6"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <span className="text-xs font-semibold tracking-widest text-slate-400">{number}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
                <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{description}</p>
                <div className="mt-5 flex min-h-11 items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                  <ExampleIcon size={15} className="shrink-0 text-blue-700" aria-hidden="true" />
                  <span className="min-w-0 truncate">{example}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        id="browser-extension"
        aria-labelledby="extension-title"
        className="scroll-mt-20 border-b border-slate-100 bg-white px-4 py-14 sm:px-6 sm:py-16 lg:px-8"
      >
        <div className="mx-auto grid max-w-7xl items-center gap-8 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-indigo-50/40 p-5 sm:p-8 lg:grid-cols-[1fr_auto] lg:gap-12">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold text-blue-800">
              <Sparkles size={14} aria-hidden="true" />
              Browser extension · Coming Soon
            </p>
            <h2 id="extension-title" className="mt-4 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
              Less typing. Faster forms. You stay in control.
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
              The upcoming extension will detect website form fields, match
              them with information and documents you have saved, and help fill
              in the details you choose. Review the matches, then submit the
              form yourself.
            </p>
          </div>
          <ul className="grid gap-3 text-sm font-medium text-slate-700 sm:grid-cols-3 lg:grid-cols-1">
            <li className="flex items-center gap-2">
              <Check size={16} className="shrink-0 text-blue-700" aria-hidden="true" />
              Less repetitive typing
            </li>
            <li className="flex items-center gap-2">
              <Check size={16} className="shrink-0 text-blue-700" aria-hidden="true" />
              Faster form completion
            </li>
            <li className="flex items-center gap-2">
              <Check size={16} className="shrink-0 text-blue-700" aria-hidden="true" />
              You choose what gets filled
            </li>
          </ul>
        </div>
      </section>

      <section
        id="features"
        aria-labelledby="features-title"
        className="scroll-mt-20 bg-slate-50/80 px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-blue-700">MADE FOR EVERYDAY PAPERWORK</p>
            <h2 id="features-title" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Your information, ready when you need it.
            </h2>
          </div>
          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <Benefit key={title} icon={Icon} title={title} description={description} />
            ))}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="privacy-title"
        className="border-t border-slate-100 bg-white px-4 py-14 sm:px-6 sm:py-16 lg:px-8"
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-5 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-indigo-50/40 p-5 sm:flex-row sm:items-start sm:gap-6 sm:p-8">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 ring-1 ring-blue-100">
            <LockKeyhole size={20} aria-hidden="true" />
          </span>
          <div className="max-w-3xl">
            <h2 id="privacy-title" className="text-lg font-semibold text-slate-900">
              Your documents are personal. You stay in the loop.
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Upload only documents you want FebRocket to process. Files and
              extracted information are used to provide document storage,
              organization, and the features you choose. Review form matches
              before filling, and submit the form yourself.
            </p>
            <Link
              href="/privacy"
              className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-blue-700 underline decoration-blue-200 underline-offset-4 hover:text-blue-800"
            >
              Read the Privacy Policy
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-9">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Upload once. Organize your information. Fill forms faster.
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
              FebRocket helps with the repetitive parts. You review the details and submit.
            </p>
          </div>
          <button
            type="button"
            onClick={startFree}
            disabled={isLoading || !authChecked}
            className="inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#2878f0] px-6 text-sm font-semibold text-white transition hover:bg-[#1e63d6] focus-visible:outline-offset-4 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
          >
            {ctaLabel}
            {!isLoading && authChecked ? <ArrowRight size={17} aria-hidden="true" /> : null}
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

function ProductWorkflowPreview() {
  const documents = [
    { name: "Personal ID.pdf", status: "Processed", ready: true },
    { name: "Address proof.pdf", status: "Processing", ready: false },
    { name: "Education record.pdf", status: "Processed", ready: true },
  ];
  const details = [
    { label: "Full name", value: "Mira Example" },
    { label: "Date of birth", value: "8 September 1994" },
    { label: "Address", value: "14 Example Road, Pune" },
  ];

  return (
    <div
      className="mx-auto w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_28px_80px_-48px_rgba(15,23,42,0.35)] sm:rounded-3xl"
      role="img"
      aria-label="Demonstration preview: a recently uploaded document is processing, extracted details are organized in a personal library, and the browser extension matches saved details to website form fields."
    >
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-100 px-4 sm:px-6">
        <span className="text-sm font-semibold tracking-tight text-slate-900">FebRocket</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-800 sm:text-xs">
          <BadgeCheck size={13} aria-hidden="true" />
          Product preview
        </span>
      </div>

      <div className="grid min-w-0 gap-3 p-3 sm:gap-4 sm:p-5 lg:grid-cols-[0.9fr_1fr_1.08fr]">
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Documents</p>
              <h2 className="mt-1 text-sm font-semibold text-slate-900">Your uploads</h2>
            </div>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Upload size={16} aria-hidden="true" />
            </span>
          </div>
          <ul className="mt-3 divide-y divide-slate-100">
            {documents.map(({ name, status, ready }) => (
              <li key={name} className="flex min-w-0 items-center gap-2.5 py-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600">
                  <FileText size={17} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-slate-800">{name}</span>
                  <span className={`mt-1 inline-flex items-center gap-1 text-[10px] ${ready ? "text-emerald-700" : "text-blue-700"}`}>
                    {ready ? <Check size={11} aria-hidden="true" /> : <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" aria-hidden="true" />}
                    {status}
                  </span>
                  {!ready ? (
                    <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-blue-100">
                      <span className="block h-full w-2/3 rounded-full bg-blue-500" />
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Personal library</p>
              <h2 className="mt-1 text-sm font-semibold text-slate-900">Mira Example</h2>
            </div>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <UserRound size={16} aria-hidden="true" />
            </span>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[10px] font-medium text-emerald-700">
            <Check size={12} aria-hidden="true" />
            Extracted from Personal ID.pdf
          </p>
          <dl className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-100 px-3">
            {details.map(({ label, value }) => (
              <div key={label} className="py-2.5">
                <dt className="text-[10px] text-slate-500">{label}</dt>
                <dd className="mt-0.5 truncate text-xs font-medium text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[10px] leading-4 text-slate-500">
            Find saved details together with their source documents.
          </p>
        </section>

        <section className="min-w-0 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/70 to-indigo-50/50 p-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
              <PanelTop size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Browser extension</p>
              <p className="text-[10px] text-slate-500">Coming soon · Example form matches</p>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-blue-100 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-slate-700">Application form</span>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-semibold text-blue-700">3 matches</span>
            </div>
            <ul className="grid gap-2">
              {details.map(({ label, value }) => (
                <li key={label} className="flex min-w-0 items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1.5">
                  <Check size={12} className="shrink-0 text-emerald-600" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[10px] text-slate-700">{label}</span>
                  <span className="shrink-0 text-[9px] font-medium text-blue-700">Matched</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 rounded-md bg-blue-600 px-2 py-2 text-center text-[10px] font-semibold text-white">
              Review selected fields
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-slate-600">
            You choose what to fill and submit the form yourself.
          </p>
        </section>
      </div>

      <div className="border-t border-slate-100 px-4 py-2.5 text-center text-[10px] text-slate-500 sm:text-xs">
        Demonstration only · Sample data · Not connected to a live account
      </div>
    </div>
  );
}

function Benefit({ icon: Icon, title, description }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
        <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </article>
  );
}
