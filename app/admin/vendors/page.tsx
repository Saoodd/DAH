import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { VendorsTable } from "@/components/admin/vendors-table";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Icon } from "@/components/ui/icon";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { APPROVAL_STATUS_LABELS } from "@/lib/constants";
import type { ApprovalStatus } from "@/types/database";

export const metadata: Metadata = { title: "Vendors" };

const STATUS_FILTERS: (ApprovalStatus | "all")[] = [
  "all",
  "profile_incomplete",
  "pending_review",
  "approved",
  "rejected",
  "suspended",
  "blacklisted",
];
const PAGE_SIZE = 50;

export default async function AdminVendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const parsedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const search = params.q?.trim().slice(0, 100).replace(/[,()%]/g, " ") || "";
  const status = (STATUS_FILTERS as string[]).includes(params.status ?? "")
    ? (params.status as ApprovalStatus | "all")
    : "all";

  const supabase = await createClient();
  let query = supabase
    .from("businesses")
    .select(
      "id, business_name, owner_name, email, phone, approval_status, created_at, category_id",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("approval_status", status);
  }
  if (search) {
    query = query.or(`business_name.ilike.%${search}%,owner_name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data: businesses, error, count } = await query.range(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE - 1
  );

  return (
    <div className="page-enter space-y-6">
      <div>
        <p className="text-caption font-semibold uppercase tracking-[0.14em] text-brand-700">Admin console</p>
        <h1 className="mt-2 font-display text-h2 text-ink-950 sm:text-h1">Vendors</h1>
        <p className="mt-2 text-sm text-ink-500">
          All registered businesses{typeof count === "number" ? ` · ${count.toLocaleString("en-US")} matching` : ""}.
        </p>
      </div>

      <form className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by approval status">
          {STATUS_FILTERS.map((s) => (
            <Link
              key={s}
              href={{
                pathname: "/admin/vendors",
                query: { ...(s !== "all" ? { status: s } : {}), ...(search ? { q: search } : {}) },
              }}
              aria-current={status === s ? "true" : undefined}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700",
                status === s
                  ? "border-ink-950 bg-ink-950 text-white shadow-sm"
                  : "border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900"
              )}
            >
              {s === "all" ? "All" : APPROVAL_STATUS_LABELS[s]}
            </Link>
          ))}
        </div>
        <div className="flex gap-2">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <div className="relative w-full sm:w-72">
            <Icon
              name="search"
              size="sm"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
            />
            <Input
              name="q"
              type="search"
              defaultValue={search}
              maxLength={100}
              placeholder="Search name, owner, email…"
              aria-label="Search vendors by name, owner, or email"
              className="pl-10"
            />
          </div>
        </div>
      </form>

      {error && (
        <Alert variant="error" title="Could not load vendors">
          Refresh the page to try again.
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          {!error && <VendorsTable businesses={businesses ?? []} />}
          {!error && (
            <Pagination
              pathname="/admin/vendors"
              page={page}
              pageSize={PAGE_SIZE}
              total={count ?? 0}
              query={{ status: status === "all" ? undefined : status, q: search || undefined }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
