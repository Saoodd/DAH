import Link from "next/link";
import { SITE_NAME } from "@/lib/constants";
import { NAV_LINKS } from "@/components/marketing/nav-links";

const footerLinkClasses =
  "rounded-md transition-colors duration-150 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-400";

export function Footer() {
  return (
    <footer className="bg-ink-950 text-ink-300">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-12 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 font-display text-sm font-semibold text-ink-950"
                aria-hidden="true"
              >
                DH
              </span>
              <span className="font-display text-[1.0625rem] font-semibold tracking-tight text-white">
                {SITE_NAME}
              </span>
            </div>
            <p className="mt-4 text-body-sm text-ink-400">
              Curated pop-up events for businesses across Dubai — one account, every event.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-10 text-sm sm:grid-cols-3 sm:gap-x-16">
            <div>
              <p className="text-caption font-semibold uppercase tracking-[0.14em] text-ink-500">
                Vendors
              </p>
              <ul className="mt-4 space-y-3 text-ink-400">
                <li>
                  <Link href="/signup" className={footerLinkClasses}>
                    Apply as a vendor
                  </Link>
                </li>
                <li>
                  <Link href="/login" className={footerLinkClasses}>
                    Log in
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-caption font-semibold uppercase tracking-[0.14em] text-ink-500">
                Explore
              </p>
              <ul className="mt-4 space-y-3 text-ink-400">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={footerLinkClasses}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-caption font-semibold uppercase tracking-[0.14em] text-ink-500">
                Support
              </p>
              <ul className="mt-4 space-y-3 text-ink-400">
                <li>
                  <a href="mailto:events@daralhay.ae" className={footerLinkClasses}>
                    events@daralhay.ae
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-ink-800 pt-6 text-caption text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
          </p>
          <p>One account, every event.</p>
        </div>
      </div>
    </footer>
  );
}
