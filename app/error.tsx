"use client";

import { useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page-enter flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
        <Icon name="warning" strokeWidth={1.5} className="h-7 w-7" />
      </div>
      <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-red-600">Something went wrong</p>
      <h1 className="mt-2 font-display text-h1 text-ink-950">We hit a snag</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-500">
        Please try again. If this keeps happening, contact Dar Al Hay support.
      </p>
      <button type="button" onClick={reset} className={buttonVariants({ variant: "primary", className: "mt-6" })}>
        Try again
      </button>
    </div>
  );
}
