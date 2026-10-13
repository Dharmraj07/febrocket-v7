import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PublicPageHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:h-20 sm:px-6 lg:px-8">
        <Link href="/" aria-label="FebRocket home" className="shrink-0">
          <Image
            src="/febrocket-logo7.png"
            alt="FebRocket"
            width={160}
            height={64}
            className="h-10 w-auto object-contain"
            priority
          />
        </Link>
        <Link
          href="/"
          aria-label="Back to home"
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-offset-2"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span className="hidden sm:inline">Back to Home</span>
        </Link>
      </div>
    </header>
  );
}
