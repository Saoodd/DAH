"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { logoutAction } from "@/app/auth/actions";
import { SITE_NAME } from "@/lib/constants";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface DashboardShellProps {
  navItems: NavItem[];
  roleLabel: string;
  identityLabel: string;
  children: React.ReactNode;
}

/** Identity + logout block shared by the desktop sidebar and mobile drawer. */
function ShellFooter({ identityLabel }: { identityLabel: string }) {
  const initial = identityLabel.trim().charAt(0).toUpperCase() || "•";
  return (
    <div className="border-t border-ink-100 px-3 pt-3">
      <div className="flex items-center gap-3 rounded-xl px-3 py-2">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800"
          aria-hidden="true"
        >
          {initial}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink-700" title={identityLabel}>
          {identityLabel}
        </p>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          <Icon name="logout" size="sm" />
          Log out
        </button>
      </form>
    </div>
  );
}

export function DashboardShell({ navItems, roleLabel, identityLabel, children }: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const drawerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!mobileOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    drawerRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    document.body.style.overflow = "hidden";

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (e.key !== "Tab" || !drawerRef.current) return;

      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [mobileOpen]);

  const NavLinks = (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-0.5 px-3">
      <p className="px-3 pb-2 pt-1 text-caption font-semibold uppercase tracking-[0.12em] text-ink-400">
        Menu
      </p>
      {navItems.map((item) => {
        const active = pathname === item.href || (item.href !== "/vendor" && item.href !== "/admin" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700",
              active
                ? "bg-ink-950 text-white shadow-sm"
                : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "shrink-0 transition-colors",
                active ? "text-brand-300" : "text-ink-400 group-hover:text-ink-600"
              )}
            >
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-ink-50/40">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-ink-100 bg-background md:flex">
        <div className="flex h-16 items-center border-b border-ink-100 px-5">
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
            <span className="leading-tight">
              <span className="block text-sm font-semibold tracking-tight text-ink-950">{SITE_NAME}</span>
              <span className="block text-caption text-ink-400">{roleLabel}</span>
            </span>
          </Link>
        </div>
        <div className="flex flex-1 flex-col justify-between py-4">
          {NavLinks}
          <ShellFooter identityLabel={identityLabel} />
        </div>
      </aside>

      {/* Mobile topbar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-ink-100 bg-background px-4 md:hidden">
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
            <span className="text-sm font-semibold tracking-tight text-ink-950">{roleLabel}</span>
          </Link>
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-700 transition-colors hover:bg-ink-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            <Icon name="menu" />
          </button>
        </header>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 animate-[var(--animate-in)] bg-ink-950/50 backdrop-blur-[2px]"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <div
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
              className="absolute inset-y-0 right-0 flex w-72 flex-col bg-background shadow-xl animate-[var(--animate-slide-up)]"
            >
              <div className="flex h-16 items-center justify-between border-b border-ink-100 px-4">
                <span className="flex items-center gap-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-950 font-display text-sm font-semibold text-brand-300"
                    aria-hidden="true"
                  >
                    DH
                  </span>
                  <span className="text-sm font-semibold tracking-tight text-ink-950">{roleLabel}</span>
                </span>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                >
                  <Icon name="close" />
                </button>
              </div>
              <div className="flex flex-1 flex-col justify-between py-4">
                {NavLinks}
                <ShellFooter identityLabel={identityLabel} />
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
