import Link from "next/link";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
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
    description: "Our event team reviews your business before you can select a booth.",
  },
  {
    title: "Pick your booth",
    description: "A live, interactive floor plan with zoom, zones, and smart recommendations.",
  },
  {
    title: "Pay & confirm",
    description: "ADCB Pace Pay or bank transfer, with a clear countdown and status tracking.",
  },
];

const features: { icon: IconName; title: string; description: string }[] = [
  {
    icon: "clipboard-list",
    title: "Clear approval journey",
    description: "Track profile review, requested changes, and approval in one place.",
  },
  {
    icon: "map",
    title: "Live booth availability",
    description: "Time-limited booth holds keep selection fair and prevent double-booking.",
  },
  {
    icon: "credit-card",
    title: "Transparent payments",
    description:
      "ADCB Pace Pay and IBAN transfer, with receipts, verification, and refunds tracked end to end.",
  },
  {
    icon: "building",
    title: "One account, every event",
    description: "Apply once, then just log in and continue for every future Dar Al Hay event.",
  },
];

const heroHighlights = ["Approval tracking", "Live floor plan", "Secure payments"];

/* Decorative booth map for the hero illustration (aria-hidden). Statuses
   mirror the platform's real booth states: available, on hold, confirmed,
   plus the vendor's current selection. */
type BoothCell = "available" | "held" | "confirmed" | "selected";
const boothGrid: BoothCell[] = [
  "available", "confirmed", "available", "available", "held", "available",
  "available", "available", "confirmed", "available", "available", "confirmed",
  "held", "available", "available", "selected", "available", "available",
  "available", "confirmed", "available", "available", "available", "held",
];

const boothCellClasses: Record<BoothCell, string> = {
  available: "border border-ink-200 bg-white",
  held: "border border-amber-200 bg-amber-100",
  confirmed: "bg-ink-900",
  selected: "bg-brand-500 ring-2 ring-brand-300 ring-offset-2 ring-offset-white",
};

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="page-enter flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-ink-100">
          <div
            className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,var(--color-brand-100),transparent_55%)]"
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 -z-10 bg-[radial-gradient(var(--color-ink-200)_1px,transparent_1px)] [background-size:26px_26px] opacity-35 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]"
            aria-hidden="true"
          />

          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:py-32">
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16">
              <div className="stagger-children max-w-2xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-caption font-semibold uppercase tracking-[0.12em] text-brand-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
                  Dubai pop-up events
                </span>

                <h1 className="mt-6 font-display text-h1 text-balance text-ink-950 sm:text-display-sm lg:text-display">
                  Apply, choose your booth, and{" "}
                  <span className="text-brand-700">get event-ready.</span>
                </h1>

                <p className="mt-6 max-w-xl text-body text-ink-600 sm:text-lg sm:leading-relaxed">
                  {SITE_NAME} is the vendor platform for curated pop-up events across Dubai — apply,
                  get approved, choose your booth on a live floor plan, pay securely, and reuse the
                  same account for every future event.
                </p>

                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/signup"
                    className={buttonVariants({ size: "lg", variant: "primary" })}
                  >
                    Apply as a Vendor
                    <Icon name="arrow-right" size="sm" />
                  </Link>
                  <Link href="/login" className={buttonVariants({ size: "lg", variant: "outline" })}>
                    Vendor Login
                  </Link>
                </div>

                <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2.5">
                  {heroHighlights.map((highlight) => (
                    <li
                      key={highlight}
                      className="inline-flex items-center gap-2 text-body-sm font-medium text-ink-600"
                    >
                      <Icon name="check" size="sm" className="text-brand-600" />
                      {highlight}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Floor-plan illustration (decorative) */}
              <div aria-hidden="true" className="relative mx-auto w-full max-w-md lg:mx-0 lg:max-w-none">
                <div className="absolute -inset-10 -z-10 rounded-[3rem] bg-[radial-gradient(circle_at_center,var(--color-brand-100),transparent_70%)]" />
                <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-xl">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-caption font-semibold uppercase tracking-[0.14em] text-ink-500">
                      Live floor plan
                    </p>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-caption font-medium text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Zone A · Open
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-6 gap-2">
                    {boothGrid.map((cell, i) => (
                      <div
                        key={i}
                        className={`aspect-square rounded-lg ${boothCellClasses[cell]}`}
                      />
                    ))}
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-ink-100 bg-ink-50/60 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500 font-display text-sm font-semibold text-white">
                        C4
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-900">Booth C4</p>
                        <p className="truncate text-caption text-ink-500">Corner · Near entrance</p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-caption font-semibold text-emerald-800">
                      Available
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-ink-500">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded border border-ink-200 bg-white" />
                      Available
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded border border-amber-200 bg-amber-100" />
                      On hold
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded bg-ink-900" />
                      Confirmed
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
            <div className="max-w-2xl">
              <p className="text-caption font-semibold uppercase tracking-[0.14em] text-brand-600">
                How it works
              </p>
              <h2 className="mt-3 font-display text-h2 text-balance text-ink-950 sm:text-h1">
                From sign-up to a confirmed booth, in five steps.
              </h2>
            </div>

            <ol className="mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-5">
              {steps.map((step, i) => (
                <li
                  key={step.title}
                  className="border-t border-ink-200 pt-6 transition-colors duration-200 hover:border-brand-400"
                >
                  <span className="font-display text-h3 text-brand-600" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-4 text-sm font-semibold text-ink-900">{step.title}</h3>
                  <p className="mt-2 text-body-sm text-ink-500">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* For vendors */}
        <section id="for-vendors" className="scroll-mt-20 border-y border-ink-100 bg-ink-50/60">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
            <div className="max-w-2xl">
              <p className="text-caption font-semibold uppercase tracking-[0.14em] text-brand-600">
                For vendors
              </p>
              <h2 className="mt-3 font-display text-h2 text-balance text-ink-950 sm:text-h1">
                Built for how Dar Al Hay events actually run.
              </h2>
            </div>

            <div className="mt-12 grid gap-5 sm:grid-cols-2">
              {features.map((feature) => (
                <Card key={feature.title} className="p-6 sm:p-7">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-brand-100 bg-brand-50 text-brand-700"
                    aria-hidden="true"
                  >
                    <Icon name={feature.icon} />
                  </span>
                  <h3 className="mt-5 text-h4 text-ink-900">{feature.title}</h3>
                  <p className="mt-2 text-body-sm text-ink-500">{feature.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section aria-labelledby="cta-heading">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
            <div className="relative overflow-hidden rounded-3xl bg-ink-950 px-7 py-14 sm:px-12 sm:py-16">
              <div
                className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgb(179_132_58_/_0.28),transparent_55%)]"
                aria-hidden="true"
              />
              <div
                className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgb(179_132_58_/_0.12),transparent_50%)]"
                aria-hidden="true"
              />

              <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
                <div className="max-w-xl">
                  <h2
                    id="cta-heading"
                    className="font-display text-h1 text-balance text-white sm:text-display-sm"
                  >
                    Ready to apply?
                  </h2>
                  <p className="mt-4 text-body text-ink-300">
                    Create your business account today. It&rsquo;s the only account you&rsquo;ll
                    ever need for Dar Al Hay events.
                  </p>
                </div>
                <Link
                  href="/signup"
                  className={buttonVariants({ size: "lg", variant: "secondary" })}
                >
                  Apply as a Vendor
                  <Icon name="arrow-right" size="sm" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
