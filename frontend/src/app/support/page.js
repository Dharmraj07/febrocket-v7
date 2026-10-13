"use client";

import {
  ArrowRight,
  FileText,
  Heart,
  HeartHandshake,
  Rocket,
  Server,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useSelector } from "react-redux";
import { selectAuth } from "@/features/auth/authSlice";
import RazorpayCheckout from "@/features/payment/components/RazorpayCheckout";
import RoleGuard from "@/features/dashboard/components/RoleGuard";
import UserWorkspaceShell from "@/features/dashboard/components/UserWorkspaceShell";

const benefits = [
  {
    icon: UsersRound,
    title: "Keep FebRocket free",
    description: "Help keep document tools accessible for people who need them.",
    style: "bg-emerald-100 text-emerald-600",
  },
  {
    icon: FileText,
    title: "Improve the tools",
    description: "Make document understanding and form filling even better.",
    style: "bg-blue-100 text-blue-600",
  },
  {
    icon: Server,
    title: "Cover running costs",
    description: "Help pay for secure servers, storage, and AI services.",
    style: "bg-blue-100 text-blue-600",
  },
  {
    icon: Heart,
    title: "Build for everyone",
    description: "Create better tools for communities facing complex paperwork.",
    style: "bg-rose-100 text-rose-600",
  },
];

export default function SupportPage() {
  const { user } = useSelector(selectAuth);

  return (
    <RoleGuard role="user">
      <UserWorkspaceShell user={user}>
        <div className="mx-auto max-w-[1120px] px-4 pb-10 pt-7 sm:px-8 lg:px-10 lg:pt-9">
          <section className="relative overflow-hidden pb-8" aria-labelledby="support-title">
            <div className="relative z-[1] max-w-[760px]">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800">
                <span aria-hidden="true">❤️</span> Support
              </span>
              <h1
                id="support-title"
                className="mt-6 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl"
              >
                Support FebRocket <span aria-hidden="true">❤️</span>
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                FebRocket is being built to make paperwork simpler for everyone.
              </p>
              <p className="mt-3 max-w-2xl text-[15px] leading-6 text-slate-600">
                You can use FebRocket without paying. If FebRocket has been useful to you and
                you&apos;d like to support its development, you can make a voluntary contribution.
              </p>
            </div>
            <div className="pointer-events-none absolute -right-2 bottom-0 hidden h-44 w-44 items-center justify-center sm:flex" aria-hidden="true">
              <span className="absolute bottom-0 h-20 w-40 rounded-t-full bg-gradient-to-r from-cyan-100 to-emerald-100" />
              <Rocket size={96} strokeWidth={1.25} className="relative -rotate-45 text-blue-500 drop-shadow-md" />
              <span className="absolute right-5 top-5 text-amber-400">✦</span>
              <span className="absolute left-3 top-12 text-amber-400">✦</span>
            </div>
          </section>

          <section
            aria-labelledby="contribution-benefits"
            className="rounded-2xl border border-slate-100 bg-slate-50/70 p-6 sm:p-7"
          >
            <h2 id="contribution-benefits" className="text-xl font-bold tracking-tight text-slate-950">
              Your contribution helps us:
            </h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {benefits.map(({ icon: Icon, title, description, style }) => (
                <article key={title} className="flex gap-3 border-slate-200 sm:flex-col sm:border-r sm:pr-4 last:border-r-0">
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${style}`}>
                    <Icon size={22} fill={title === "Build for everyone" ? "currentColor" : "none"} />
                  </span>
                  <div>
                    <h3 className="font-semibold text-slate-800">{title}</h3>
                    <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="support-options" className="mt-9">
            <h2 id="support-options" className="text-2xl font-bold tracking-tight text-slate-950">
              Make a contribution
            </h2>
            <div className="mt-5 grid items-stretch gap-4 md:grid-cols-2">
              <section className="flex h-full flex-col rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm shadow-amber-950/[0.03] sm:p-7">
                <div className="flex items-start gap-4">
                  <span
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-3xl shadow-sm ring-1 ring-amber-100"
                    aria-hidden="true"
                  >
                    ☕
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-600">Support via</p>
                        <h3 className="text-xl font-bold tracking-tight text-slate-950">
                          Buy Me a Coffee
                        </h3>
                      </div>
                      <ArrowRight
                        size={20}
                        className="mt-1 text-amber-600"
                        aria-hidden="true"
                      />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      Support from anywhere in the world with a quick contribution.
                    </p>
                  </div>
                </div>
                <p className="mt-5 flex items-center gap-2 text-sm text-slate-600">
                  <span aria-hidden="true">◎</span> International support
                </p>
                <a
                  href="https://buymeacoffee.com/febrocket"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 md:mt-5"
                >
                  Support via Buy Me a Coffee
                  <ArrowRight size={17} aria-hidden="true" />
                </a>
              </section>
              <RazorpayCheckout />
            </div>
          </section>

          <section className="mt-6 flex gap-4 rounded-[22px] bg-emerald-50/80 p-5 sm:items-center sm:p-6">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <HeartHandshake size={27} />
            </span>
            <div>
              <h2 className="font-bold text-emerald-800">This is completely optional</h2>
              <p className="mt-1 text-sm leading-6 text-emerald-900">
                You are not required to contribute to use FebRocket. A contribution does not unlock
                special treatment or guarantee any particular feature.
              </p>
            </div>
          </section>

          <section className="relative mt-7 flex min-h-28 items-center justify-between overflow-hidden px-1 py-3 sm:px-3">
            <div>
              <p className="text-3xl font-semibold tracking-tight text-blue-700">Thank you!</p>
              <p className="mt-2 text-base text-slate-600">
                Thank you for helping us build FebRocket. <span aria-hidden="true">🚀</span>
              </p>
            </div>
            <Heart size={54} fill="currentColor" className="mr-5 text-rose-300" aria-hidden="true" />
          </section>

          <section className="rounded-2xl border border-slate-100 bg-slate-50/70 p-6 sm:p-7">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                <ShieldCheck size={22} />
              </span>
              <div>
                <h2 className="font-bold text-slate-900">Contribution &amp; Refunds</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Contributions are voluntary and are intended to support FebRocket&apos;s
                  development. Please review your payment details carefully before confirming.
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  If you made a payment by mistake or believe there is an issue with a payment,
                  contact us at{" "}
                  <a
                    href="mailto:hello@febrocket.com"
                    className="font-semibold text-blue-600 hover:text-blue-700"
                  >
                    hello@febrocket.com
                  </a>{" "}
                  and we&apos;ll review your request.
                </p>
              </div>
            </div>
          </section>
        </div>
      </UserWorkspaceShell>
    </RoleGuard>
  );
}
