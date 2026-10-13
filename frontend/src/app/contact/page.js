
"use client";

import { Mail, Phone } from "lucide-react";
import PublicPageHeader from "@/components/PublicPageHeader";

export default function Contact() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">

      <PublicPageHeader />

      {/* CONTACT */}
      <section className="flex min-h-[calc(100vh-4rem)] items-center px-4 py-12 sm:min-h-[calc(100vh-5rem)] sm:px-6 sm:py-14">

        <div className="mx-auto w-full max-w-3xl">

          {/* Heading */}
          <div className="text-center">

            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <Mail size={26} />
            </div>

            <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
              Get in touch.
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-slate-500">
              Have a question, feedback, or need help with FebRocket?
              We&apos;re here to help.
            </p>

          </div>


          {/* Contact Cards */}
          <div className="mt-10 grid gap-4 sm:grid-cols-2">

            {/* Email */}
            <a
              href="mailto:hello@febrocket.com"
              className="group rounded-xl border border-slate-200 bg-white p-6 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >

              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Mail size={22} />
              </div>

              <p className="mt-5 text-sm font-semibold uppercase tracking-wider text-slate-500">
                Email
              </p>

              <p className="mt-2 text-lg font-semibold text-slate-900">
                hello@febrocket.com
              </p>

            </a>


            {/* Phone */}
            <a
              href="tel:+919835373057"
              className="group rounded-xl border border-slate-200 bg-white p-6 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >

              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Phone size={22} />
              </div>

              <p className="mt-5 text-sm font-semibold uppercase tracking-wider text-slate-500">
                Phone
              </p>

              <p className="mt-2 text-lg font-semibold text-slate-900">
                +91 98353 73057
              </p>

            </a>

          </div>


          {/* Footer Message */}
          <p className="mt-8 text-center text-sm text-slate-500">
            We&apos;ll get back to you as soon as possible.
          </p>

        </div>

      </section>

    </main>
  );
}
