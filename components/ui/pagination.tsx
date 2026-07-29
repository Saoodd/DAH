import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

interface PaginationProps {
  pathname: string;
  page: number;
  pageSize: number;
  total: number;
  query?: Record<string, string | undefined>;
}

function pageHref(
  pathname: string,
  page: number,
  query: Record<string, string | undefined>
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function Pagination({
  pathname,
  page,
  pageSize,
  total,
  query = {},
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  const currentPage = Math.min(page, pageCount);
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-center justify-between gap-3 border-t border-ink-100 px-4 py-4 sm:flex-row sm:px-6"
    >
      <p className="text-sm text-ink-500">
        Page {currentPage} of {pageCount} · {total.toLocaleString("en-US")} total
      </p>
      <div className="flex gap-2">
        {currentPage > 1 ? (
          <Link
            href={pageHref(pathname, currentPage - 1, query)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Previous
          </Link>
        ) : null}
        {currentPage < pageCount ? (
          <Link
            href={pageHref(pathname, currentPage + 1, query)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
