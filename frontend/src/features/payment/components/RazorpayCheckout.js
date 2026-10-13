import { ArrowUpRight, ArrowRight, Landmark } from "lucide-react";

const RAZORPAY_PAYMENT_URL = "https://razorpay.me/@febrocket";

export default function RazorpayCheckout() {
  return (
    <section
      aria-labelledby="razorpay-checkout-heading"
      className="flex h-full flex-col rounded-2xl border border-blue-100 bg-white p-5 shadow-sm shadow-blue-950/[0.03] sm:p-7"
    >
      <div className="flex items-start gap-4">
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-3xl shadow-sm ring-1 ring-blue-100"
          aria-hidden="true"
        >
          🇮🇳
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-600">Support via</p>
              <h2
                id="razorpay-checkout-heading"
                className="text-xl font-bold tracking-tight text-slate-950"
              >
                Razorpay
              </h2>
            </div>
            <ArrowRight
              size={20}
              className="mt-1 text-blue-600"
              aria-hidden="true"
            />
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Choose any amount and complete your contribution on Razorpay&apos;s
            secure payment page.
          </p>
        </div>
      </div>

      <div
        className="mt-5 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500"
        aria-label="Accepted payment methods"
      >
        <span className="italic tracking-tight">UPI</span>
        <span className="text-blue-700">VISA</span>
        <span className="text-rose-600">Mastercard</span>
        <Landmark size={17} aria-hidden="true" />
        <span className="sr-only">Cards and net banking</span>
      </div>

      <div className="mt-auto pt-5">
        <a
          href={RAZORPAY_PAYMENT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          Continue to Razorpay
          <ArrowUpRight size={17} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
