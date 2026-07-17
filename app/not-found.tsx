import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">404</p>
      <h1 className="mt-2 text-3xl font-semibold text-ink-950">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-500">
        The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved.
      </p>
      <Link href="/" className={buttonVariants({ variant: "primary", className: "mt-6" })}>
        Back to homepage
      </Link>
    </div>
  );
}
