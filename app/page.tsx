import Link from "next/link";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { buttonVariants } from "@/components/ui/button";
import { SITE_NAME } from "@/lib/constants";

const steps = [
  {
    title: "Create your account",
    description: "One account per business. Tell us who you are and what you sell.",
  },
  {
    title: "Complete your profile",
    description: "Logo, description, category, and licence — saved permanently for every future event.",
  },
  {
    title: "Get approved",
    description: "Saeed or Omar review your business before you can select a booth.",
  },
  {
    title: "Pick your booth",
    description: "A live, interactive floor plan with zoom, zones, and smart recommendations.",
  },
  {
    title: "Pay & confirm",
    description: "ADCB Pace Pay or bank transfer, with a clear countdown and instant status updates.",
  },
];

const features = [
  {
    title: "Real approval workflow",
    description: "Profile review, reconsideration, and reapproval — not a static form.",
  },
  {
    title: "Live booth availability",
    description: "Database-backed 5-minute holds so two vendors never win the same booth.",
  },
  {
    title: "Transparent payments",
    description: "ADCB Pace Pay and IBAN transfer, with receipts, verification, and refunds tracked end to end.",
  },
  {
    title: "One account, every event",
    description: "Apply once, then just log in and continue for every future Dar Al Hay event.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-ink-100">
          <div
            className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,var(--color-brand-100),transparent_55%)]"
            aria-hidden="true"
          />
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <div className="max-w-2xl">
              <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
                Dubai pop-up events
              </span>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-ink-950 sm:text-6xl">
                Run your Dar Al Hay booth application end to end.
              </h1>
              <p className="mt-5 text-lg text-ink-600">
                {SITE_NAME} is the vendor platform for curated pop-up events across Dubai — apply, get
                approved, choose your booth on a live floor plan, pay securely, and reuse the same
                account for every future event.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup" className={buttonVariants({ size: "lg", variant: "primary" })}>
                  Apply as a Vendor
                </Link>
                <Link href="/login" className={buttonVariants({ size: "lg", variant: "outline" })}>
                  Vendor Login
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-600">How it works</h2>
          <p className="mt-2 max-w-xl text-2xl font-semibold text-ink-950 sm:text-3xl">
            From sign-up to a confirmed booth, in five steps.
          </p>

          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {steps.map((step, i) => (
              <li key={step.title} className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-sm font-semibold text-brand-300">
                  {i + 1}
                </span>
                <p className="mt-4 text-sm font-semibold text-ink-900">{step.title}</p>
                <p className="mt-1.5 text-sm text-ink-500">{step.description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="for-vendors" className="border-y border-ink-100 bg-ink-50/60">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-600">For vendors</h2>
            <p className="mt-2 max-w-xl text-2xl font-semibold text-ink-950 sm:text-3xl">
              Built for how Dar Al Hay events actually run.
            </p>

            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {features.map((feature) => (
                <div key={feature.title} className="rounded-2xl border border-ink-100 bg-white p-6">
                  <p className="text-base font-semibold text-ink-900">{feature.title}</p>
                  <p className="mt-2 text-sm text-ink-500">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-ink-950 px-8 py-12 sm:flex-row sm:items-center sm:px-12">
            <div>
              <h2 className="text-2xl font-semibold text-white sm:text-3xl">Ready to apply?</h2>
              <p className="mt-2 max-w-md text-ink-300">
                Create your business account today. It&rsquo;s the only account you&rsquo;ll ever need
                for Dar Al Hay events.
              </p>
            </div>
            <Link href="/signup" className={buttonVariants({ size: "lg", variant: "secondary" })}>
              Apply as a Vendor
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
