import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export default function NotFound() {
  return (
    <div className="page-enter flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <Icon strokeWidth={1.5} className="h-7 w-7">
          <path d="M9.879 9.879a3 3 0 104.242 4.242M9.88 9.88l4.242 4.242M9.88 9.88L7.05 7.05m7.072 7.072l2.828 2.828M12 3.75a8.25 8.25 0 100 16.5 8.25 8.25 0 000-16.5z" />
        </Icon>
      </div>
      <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-brand-600">404</p>
      <h1 className="mt-2 font-display text-h1 text-ink-950">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-500">
        The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved.
      </p>
      <Link href="/" className={buttonVariants({ variant: "primary", className: "mt-6" })}>
        Back to homepage
      </Link>
    </div>
  );
}
