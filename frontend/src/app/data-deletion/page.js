import { Trash2, Mail, CheckCircle2 } from "lucide-react";
import PublicPageHeader from "@/components/PublicPageHeader";

export const metadata = {
  title: "Data Deletion | FebRocket",
  description:
    "Learn how to request deletion of your FebRocket account and personal data.",
};

export default function DataDeletion() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <PublicPageHeader />

      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="bg-white p-6 sm:p-8 md:p-10">
          <div className="mb-10">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-red-50 text-red-700">
              <Trash2 size={25} />
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight">
              Data Deletion
            </h1>

            <p className="mt-3 text-sm text-slate-500">
              Last updated: September 18, 2026
            </p>
          </div>

          <div className="space-y-10 leading-7 text-slate-600">
            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                Delete Your FebRocket Data
              </h2>

              <p>
                You can request deletion of your FebRocket account and
                associated personal information at any time.
              </p>

              <p className="mt-4">
                If you signed in using Google or Facebook, you can also request
                deletion of information associated with that authentication
                account.
              </p>
            </section>

            <section>
              <h2 className="mb-5 text-2xl font-bold text-slate-900">
                How to Request Deletion
              </h2>

              <div>
                <div className="flex gap-4 border-t border-slate-200 py-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <Mail size={20} />
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900">
                      Email us your request
                    </h3>

                    <p className="mt-1 text-sm">
                      Send an email to{" "}
                      <a
                        href="mailto:hello@febrocket.com"
                        className="font-semibold text-slate-900 underline-offset-4 hover:underline"
                      >
                        hello@febrocket.com
                      </a>
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 border-t border-slate-200 py-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <CheckCircle2 size={20} />
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900">
                      Include your account information
                    </h3>

                    <p className="mt-1 text-sm">
                      Include the email address associated with your FebRocket
                      account so that we can identify your account.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 border-y border-slate-200 py-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700">
                    <Trash2 size={20} />
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900">
                      Account and data deletion
                    </h3>

                    <p className="mt-1 text-sm">
                      We will review the request and delete information that
                      we are not required to retain by law or for legitimate
                      security purposes.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                What May Be Deleted
              </h2>

              <ul className="list-disc space-y-2 pl-6">
                <li>Your FebRocket account</li>
                <li>Your profile information</li>
                <li>Authentication information associated with your account</li>
                <li>Documents and files associated with your account</li>
                <li>Other personal information associated with your account</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                Information We May Need to Retain
              </h2>

              <p>
                In some circumstances, we may need to retain limited information
                when required by law, necessary to prevent fraud or abuse, or
                needed to resolve disputes and enforce our agreements.
              </p>
            </section>

            <section className="border-t border-slate-200 pt-6">
              <h2 className="mb-3 text-xl font-bold text-slate-900">
                Request Data Deletion
              </h2>

              <p className="text-sm leading-6">
                To request deletion of your FebRocket account and associated
                personal information, contact us at:
              </p>

              <a
                href="mailto:hello@febrocket.com?subject=FebRocket%20Data%20Deletion%20Request"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <Mail size={17} />
                Request Data Deletion
              </a>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                Contact
              </h2>

              <p>
                For questions about data deletion or privacy:
              </p>

              <p className="mt-4 font-semibold text-slate-900">
                hello@febrocket.com
              </p>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}