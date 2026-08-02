import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/env";
import { getCurrentUser } from "@/lib/dal";
import { SITE_NAME } from "@/lib/constants";
import { NAV_LINKS } from "@/components/marketing/nav-links";
import { MobileNav } from "@/components/marketing/mobile-nav";

export async function Navbar() {
  const session = isSupabaseConfigured() ? await getCurrentUser().catch(() => null) : null;
  const dashboardHref = session?.profile?.role === "admin" ? "/admin" : "/vendor";

  return (
    <header className="nav-scroll sticky top-0 z-40 bg-background/85 backdrop-blur-md">
      <nav
        aria-label="Primary navigation"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6"
      >
        <Link
          href="/"
          aria-label={`${SITE_NAME} home`}
          className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-950 font-display text-sm font-semibold text-brand-300 shadow-sm"
            aria-hidden="true"
          >
            DH
          </span>
          <span className="hidden truncate font-display text-[1.0625rem] font-semibold tracking-tight text-ink-950 sm:block">
            {SITE_NAME}
          </span>
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md text-sm font-medium text-ink-600 transition-colors duration-150 hover:text-ink-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-700"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {session ? (
            <Link href={dashboardHref} className={buttonVariants({ size: "sm", variant: "primary" })}>
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className={buttonVariants({
                  size: "sm",
                  variant: "ghost",
                  className: "hidden md:inline-flex",
                })}
              >
                Log in
              </Link>
              <Link
                href="/signup"
                aria-label="Apply as a vendor"
                className={buttonVariants({ size: "sm", variant: "primary" })}
              >
                <span className="md:hidden">Apply</span>
                <span className="hidden md:inline">Apply as a Vendor</span>
              </Link>
            </>
          )}
          <MobileNav isAuthenticated={Boolean(session)} dashboardHref={dashboardHref} />
        </div>
      </nav>
    </header>
  );
}
