import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import PublicPageHeader from "@/components/PublicPageHeader";

export const metadata = {
  title: "Privacy Policy | FebRocket",
  description:
    "Learn how FebRocket collects, uses, protects, and manages your personal information.",
};

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <PublicPageHeader />

      {/* Content */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="bg-white p-6 sm:p-8 md:p-10">
          <div className="mb-10">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <ShieldCheck size={25} />
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight">
              Privacy Policy
            </h1>

            <p className="mt-3 text-sm text-slate-500">
              Last updated: September 18, 2026
            </p>
          </div>

          <div className="space-y-10 leading-7 text-slate-600">
            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                1. Introduction
              </h2>

              <p>
                Welcome to FebRocket. This Privacy Policy explains how
                FebRocket collects, uses, stores, and protects information when
                you use our website, applications, and services.
              </p>

              <p className="mt-4">
                By using FebRocket, you acknowledge that you have read and
                understood this Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                2. Information We Collect
              </h2>

              <p>
                Depending on how you use FebRocket, we may collect information
                such as:
              </p>

              <ul className="mt-4 list-disc space-y-2 pl-6">
                <li>Name and username</li>
                <li>Email address</li>
                <li>Profile picture</li>
                <li>Authentication provider information</li>
                <li>Documents and files that you choose to upload</li>
                <li>Information you provide when using our services</li>
                <li>Technical information such as browser and device data</li>
                <li>Usage information relating to our services</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                3. Google and Facebook Login
              </h2>

              <p>
                FebRocket may allow you to create or access an account using
                third-party authentication services such as Google or
                Facebook.
              </p>

              <p className="mt-4">
                When you use a third-party login provider, we may receive
                information that the provider makes available to us, such as
                your name, email address, profile picture, and provider
                identifier, depending on your permissions and the provider&apos;s
                policies.
              </p>

              <p className="mt-4">
                We use this information to create, authenticate, and maintain
                your FebRocket account.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                4. How We Use Your Information
              </h2>

              <p>We may use information to:</p>

              <ul className="mt-4 list-disc space-y-2 pl-6">
                <li>Create and manage your account</li>
                <li>Provide and improve FebRocket services</li>
                <li>Store and organize your documents</li>
                <li>Provide form-related functionality</li>
                <li>Communicate with you about the service</li>
                <li>Maintain security and prevent abuse</li>
                <li>Diagnose technical problems</li>
                <li>Comply with applicable legal obligations</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                5. Document Information
              </h2>

              <p>
                FebRocket may allow you to upload documents containing personal
                information. You are responsible for ensuring that you have
                appropriate rights to upload and use those documents.
              </p>

              <p className="mt-4">
                We use uploaded documents only for providing the functionality
                of FebRocket, including document storage, organization, and
                features that you explicitly use.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                6. Data Storage and Security
              </h2>

              <p>
                We use reasonable technical and organizational measures designed
                to protect your information against unauthorized access,
                alteration, disclosure, or destruction.
              </p>

              <p className="mt-4">
                However, no online service can guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                7. Third-Party Services
              </h2>

              <p>
                FebRocket may use trusted third-party service providers for
                functions such as authentication, hosting, database services,
                file storage, email delivery, analytics, and security.
              </p>

              <p className="mt-4">
                These providers may process information as necessary to provide
                their services to FebRocket.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                8. Data Retention
              </h2>

              <p>
                We retain information for as long as reasonably necessary to
                provide our services, maintain your account, comply with legal
                obligations, resolve disputes, and enforce our agreements.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                9. Your Rights
              </h2>

              <p>
                Depending on applicable law, you may have rights concerning your
                personal information, including rights to access, correct, or
                request deletion of your information.
              </p>

              <p className="mt-4">
                You can learn how to request deletion of your account and
                associated information on our{" "}
                <Link
                  href="/data-deletion"
                  className="font-semibold text-slate-900 underline-offset-4 hover:underline"
                >
                  Data Deletion
                </Link>{" "}
                page.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                10. Children&apos;s Privacy
              </h2>

              <p>
                FebRocket is not intended to knowingly collect personal
                information from children where such collection is prohibited
                by applicable law.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                11. Changes to This Policy
              </h2>

              <p>
                We may update this Privacy Policy from time to time. When we
                make changes, we will update the date shown at the top of this
                page.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl font-bold text-slate-900">
                12. Contact Us
              </h2>

              <p>
                If you have questions about this Privacy Policy or your
                personal information, contact us at:
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