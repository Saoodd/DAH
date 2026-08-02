import Link from "next/link";
import { SITE_NAME } from "@/lib/constants";
import { Icon } from "@/components/ui/icon";

const assurances = [
  {
    title: "One account, every event",
    description: "Apply once — your business profile carries over to every future Dar Al Hay event.",
  },
  {
    title: "A clear path to approval",
    description: "Follow your application from review to booth selection in one place, with no guesswork.",
  },
  {
    title: "Fair, secure booth booking",
    description: "A live floor plan with time-limited holds, transparent payments, and tracked receipts.",
  },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Brand panel — desktop only. The form side stays the focus below lg. */}
      <aside className="relative hidden w-[44%] max-w-2xl flex-col justify-between overflow-hidden bg-ink-950 px-10 py-10 lg:flex xl:px-14">
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgb(179_132_58/0.24),transparent_55%)]"
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 bg-[radial-gradient(var(--color-ink-700)_1px,transparent_1px)] [background-size:26px_26px] opacity-30 [mask-image:radial-gradient(ellipse_at_bottom_left,black_10%,transparent_70%)]"
          aria-hidden="true"
        />

        <Link
          href="/"
          className="relative flex w-fit items-center gap-2.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-300"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 font-display text-sm font-semibold text-brand-300 ring-1 ring-white/15"
            aria-hidden="true"
          >
            DH
          </span>
          <span className="font-display text-[1.0625rem] font-semibold tracking-tight text-white">{SITE_NAME}</span>
        </Link>

        <div className="relative max-w-md">
          <h2 className="font-display text-h2 text-balance text-white">
            Everything your business needs to get event-ready.
          </h2>
          <ul className="mt-10 space-y-7">
            {assurances.map((item) => (
              <li key={item.title} className="flex items-start gap-3.5">
                <span
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-300 ring-1 ring-brand-400/30"
                  aria-hidden="true"
                >
                  <Icon name="check" size="xs" strokeWidth={2} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-300">{item.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-caption font-medium uppercase tracking-[0.14em] text-ink-400">
          Dubai · Curated pop-up events
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-ink-100 bg-background lg:hidden">
          <div className="mx-auto flex h-16 max-w-2xl items-center px-4 sm:px-6">
            <Link
              href="/"
              className="flex items-center gap-2.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-950 font-display text-sm font-semibold text-brand-300"
                aria-hidden="true"
              >
                DH
              </span>
              <span className="font-display text-base font-semibold tracking-tight text-ink-950">{SITE_NAME}</span>
            </Link>
          </div>
        </header>
        <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 sm:py-14">
          <div className="page-enter w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
