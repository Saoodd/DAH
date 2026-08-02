"use client";

import * as React from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { NAV_LINKS } from "@/components/marketing/nav-links";

interface MobileNavProps {
  isAuthenticated: boolean;
  dashboardHref: string;
}

/**
 * Disclosure-style mobile menu for the marketing navbar. Renders the toggle
 * button plus a full-width panel pinned under the sticky header. Closes on
 * Escape and on any link activation.
 */
export function MobileNav({ isAuthenticated, dashboardHref }: MobileNavProps) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-700 transition-colors duration-150 hover:bg-ink-100 hover:text-ink-950 active:bg-ink-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        <Icon name={open ? "close" : "menu"} size="lg" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 top-16 z-30 animate-in bg-ink-950/25 md:hidden"
            onClick={close}
            aria-hidden="true"
          />
          <div
            id="mobile-nav-panel"
            className="fixed inset-x-0 top-16 z-40 origin-top animate-scale-in border-b border-ink-100 bg-background shadow-lg md:hidden"
          >
            <nav
              aria-label="Mobile navigation"
              className="mx-auto max-w-6xl px-4 pb-5 pt-3 sm:px-6"
            >
              <ul className="flex flex-col gap-1">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={close}
                      className="flex h-12 items-center rounded-xl px-3 text-body font-medium text-ink-700 transition-colors duration-150 hover:bg-ink-100 hover:text-ink-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-col gap-2.5 border-t border-ink-100 pt-4">
                {isAuthenticated ? (
                  <Link
                    href={dashboardHref}
                    onClick={close}
                    className={buttonVariants({ variant: "primary" })}
                  >
                    Dashboard
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/signup"
                      onClick={close}
                      className={buttonVariants({ variant: "primary" })}
                    >
                      Apply as a Vendor
                    </Link>
                    <Link
                      href="/login"
                      onClick={close}
                      className={buttonVariants({ variant: "outline" })}
                    >
                      Log in
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
