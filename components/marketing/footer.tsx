import Link from "next/link";
import { SITE_NAME } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="border-t border-ink-100 bg-ink-950 text-ink-300">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-ink-950">
                DH
              </span>
              <span className="text-sm font-semibold text-white">{SITE_NAME}</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-ink-400">
              Curated pop-up events for businesses across Dubai — one account, every event.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 text-sm sm:flex sm:gap-16">
            <div>
              <p className="font-semibold text-white">Vendors</p>
              <ul className="mt-3 space-y-2 text-ink-400">
                <li>
                  <Link href="/signup" className="hover:text-white">
                    Apply
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="hover:text-white">
                    Log in
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-white">Support</p>
              <ul className="mt-3 space-y-2 text-ink-400">
                <li>
                  <a href="mailto:events@daralhay.ae" className="hover:text-white">
                    events@daralhay.ae
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-ink-800 pt-6 text-xs text-ink-500">
          © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
