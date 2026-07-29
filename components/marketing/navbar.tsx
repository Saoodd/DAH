import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/env";
import { getCurrentUser } from "@/lib/dal";
import { SITE_NAME } from "@/lib/constants";

export async function Navbar() {
  const session = isSupabaseConfigured() ? await getCurrentUser().catch(() => null) : null;
  const dashboardHref = session?.profile?.role === "admin" ? "/admin" : "/vendor";

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-background/80 backdrop-blur-md">
      <nav
        aria-label="Primary navigation"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6"
      >
        <Link
          href="/"
          aria-label={`${SITE_NAME} home`}
          className="flex min-w-0 items-center gap-2 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-900 text-sm font-bold text-brand-300"
            aria-hidden="true"
          >
            DH
          </span>
          <span className="hidden truncate text-base font-semibold tracking-tight text-ink-900 sm:block">
            {SITE_NAME}
          </span>
        </Link>

        <div className="hidden items-center gap-8 lg:flex">
          <Link
            href="/#how-it-works"
            className="rounded-md text-sm font-medium text-ink-600 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-700"
          >
            How it works
          </Link>
          <Link
            href="/#for-vendors"
            className="rounded-md text-sm font-medium text-ink-600 hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-700"
          >
            For Vendors
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {session ? (
            <Link href={dashboardHref} className={buttonVariants({ size: "sm", variant: "primary" })}>
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className={buttonVariants({ size: "sm", variant: "ghost" })}>
                Log in
              </Link>
              <Link
                href="/signup"
                aria-label="Apply as a vendor"
                className={buttonVariants({ size: "sm", variant: "primary" })}
              >
                <span className="sm:hidden">Apply</span>
                <span className="hidden sm:inline">Apply as a Vendor</span>
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
