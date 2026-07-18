"use client";

import { useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
        <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </div>
      <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-red-600">Something went wrong</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-950">We hit a snag</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-500">
        Please try again. If this keeps happening, contact Dar Al Hay support.
      </p>
      {process.env.NODE_ENV === "development" && (
        <pre className="mt-4 max-w-lg overflow-x-auto rounded-xl border border-red-200 bg-red-50 p-3 text-left text-xs text-red-700">
          {error.message}
          {error.digest && `\n\ndigest: ${error.digest}`}
        </pre>
      )}
      <button onClick={reset} className={buttonVariants({ variant: "primary", className: "mt-6" })}>
        Try again
      </button>
    </div>
  );
}
