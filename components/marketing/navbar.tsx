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
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 text-sm font-bold text-brand-300">
            DH
          </span>
          <span className="text-sm font-semibold tracking-tight text-ink-900 sm:text-base">{SITE_NAME}</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <Link href="/#how-it-works" className="text-sm font-medium text-ink-600 hover:text-ink-900">
            How it works
          </Link>
          <Link href="/#for-vendors" className="text-sm font-medium text-ink-600 hover:text-ink-900">
            For Vendors
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {session ? (
            <Link href={dashboardHref} className={buttonVariants({ size: "sm", variant: "primary" })}>
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className={buttonVariants({ size: "sm", variant: "ghost", className: "hidden sm:inline-flex" })}
              >
                Log in
              </Link>
              <Link href="/signup" className={buttonVariants({ size: "sm", variant: "primary" })}>
                Apply as a Vendor
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
