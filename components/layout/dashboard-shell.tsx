"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
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

export function DashboardShell({ navItems, roleLabel, identityLabel, children }: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const NavLinks = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {navItems.map((item) => {
        const active = pathname === item.href || (item.href !== "/vendor" && item.href !== "/admin" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100"
            )}
          >
            {item.icon}
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
        <div className="flex h-16 items-center gap-2 border-b border-ink-100 px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 text-sm font-bold text-brand-300">
            DH
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-ink-900">{SITE_NAME}</p>
            <p className="text-xs text-ink-400">{roleLabel}</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-between py-4">
          {NavLinks}
          <div className="border-t border-ink-100 px-3 pt-4">
            <p className="truncate px-3 text-xs text-ink-400">{identityLabel}</p>
            <form action={logoutAction}>
              <button
                type="submit"
                className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink-600 hover:bg-ink-100"
              >
                <LogoutIcon />
                Log out
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Mobile topbar */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-ink-100 bg-background px-4 md:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 text-sm font-bold text-brand-300">
              DH
            </span>
            <span className="text-sm font-semibold text-ink-900">{roleLabel}</span>
          </div>
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-100"
          >
            <MenuIcon />
          </button>
        </header>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-ink-950/40" onClick={() => setMobileOpen(false)} />
            <div className="absolute inset-y-0 right-0 flex w-72 flex-col bg-background shadow-xl">
              <div className="flex h-16 items-center justify-between border-b border-ink-100 px-4">
                <span className="text-sm font-semibold text-ink-900">Menu</span>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100"
                >
                  <CloseIcon />
                </button>
              </div>
              <div className="flex flex-1 flex-col justify-between py-4">
                {NavLinks}
                <div className="border-t border-ink-100 px-3 pt-4">
                  <p className="truncate px-3 text-xs text-ink-400">{identityLabel}</p>
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink-600 hover:bg-ink-100"
                    >
                      <LogoutIcon />
                      Log out
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M8.25 9V5.25A2.25 2.25 0 0110.5 3h6a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0116.5 21h-6a2.25 2.25 0 01-2.25-2.25V15M3 12h13.5m0 0l-3.75-3.75M16.5 12l-3.75 3.75"
      />
    </svg>
  );
}
