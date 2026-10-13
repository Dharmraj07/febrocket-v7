import { FileText } from "lucide-react";
import PublicPageHeader from "@/components/PublicPageHeader";

export const metadata = {
  title: "Terms of Service | FebRocket",
  description: "Terms and conditions for using FebRocket.",
};

export default function TermsOfService() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <PublicPageHeader />

      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="bg-white p-6 sm:p-8 md:p-10">
          <div className="mb-10">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <FileText size={25} />
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight">
              Terms of Service
            </h1>

            <p className="mt-3 text-sm text-slate-500">
              Last updated: September 18, 2026
            </p>
          </div>

          <div className="space-y-10 leading-7 text-slate-600">
            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                1. Acceptance of Terms
              </h2>

              <p>
                These Terms of Service govern your use of FebRocket&apos;s website,
                applications, and services.
              </p>

              <p className="mt-4">
                By accessing or using FebRocket, you agree to these Terms. If
                you do not agree with these Terms, please do not use the
                service.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                2. Description of Service
              </h2>

              <p>
                FebRocket provides tools that may allow users to store,
                organize, access, and manage documents and information and use
                features designed to simplify online forms.
              </p>

              <p className="mt-4">
                Features may change or be updated as FebRocket develops its
                products.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                3. User Accounts
              </h2>

              <p>
                You are responsible for maintaining the security of your
                account and for activity that occurs through your account.
              </p>

              <p className="mt-4">
                You must provide accurate information when creating an account
                and must not impersonate another person or entity.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                4. Acceptable Use
              </h2>

              <p>You agree not to use FebRocket to:</p>

              <ul className="mt-4 list-disc space-y-2 pl-6">
                <li>Break applicable laws or regulations</li>
                <li>Impersonate another person or organization</li>
                <li>Upload malicious software or harmful content</li>
                <li>Attempt to gain unauthorized access to the service</li>
                <li>Abuse, disrupt, or interfere with the service</li>
                <li>Infringe the rights of another person</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                5. User Content
              </h2>

              <p>
                You retain responsibility for documents and other content that
                you upload to FebRocket.
              </p>

              <p className="mt-4">
                You represent that you have the necessary rights and
                permissions to upload and use such content.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                6. Third-Party Services
              </h2>

              <p>
                FebRocket may integrate with third-party services, including
                authentication providers such as Google and Facebook.
              </p>

              <p className="mt-4">
                Your use of those services may also be subject to the
                third-party provider&apos;s terms and policies.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                7. Service Availability
              </h2>

              <p>
                We aim to keep FebRocket available and reliable, but we do not
                guarantee that the service will always be uninterrupted,
                available, or error-free.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                8. Intellectual Property
              </h2>

              <p>
                FebRocket&apos;s software, branding, design, logos, and other
                original materials are owned by FebRocket or its licensors and
                may be protected by applicable intellectual property laws.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                9. Account Termination
              </h2>

              <p>
                You may stop using FebRocket at any time. We may suspend or
                terminate accounts where we reasonably believe that a user has
                violated these Terms or applicable law.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                10. Disclaimer
              </h2>

              <p>
                FebRocket is provided on an &quot;as available&quot; basis. You are
                responsible for reviewing information and documents before
                submitting any official form or application.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                11. Changes to These Terms
              </h2>

              <p>
                We may update these Terms from time to time. Updated Terms will
                be posted on this page along with a revised update date.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                12. Contact
              </h2>

              <p>
                If you have questions about these Terms, contact:
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