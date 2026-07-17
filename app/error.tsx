"use client";

import { useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-red-600">Something went wrong</p>
      <h1 className="mt-2 text-3xl font-semibold text-ink-950">We hit a snag</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-500">
        Please try again. If this keeps happening, contact Dar Al Hay support.
      </p>
      <button onClick={reset} className={buttonVariants({ variant: "primary", className: "mt-6" })}>
        Try again
      </button>
    </div>
  );
}
