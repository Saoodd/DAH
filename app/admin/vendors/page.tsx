import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { VendorsTable } from "@/components/admin/vendors-table";
import { Input } from "@/components/ui/input";
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

export default async function AdminVendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const status = (STATUS_FILTERS as string[]).includes(params.status ?? "")
    ? (params.status as ApprovalStatus | "all")
    : "all";

  const supabase = await createClient();
  let query = supabase
    .from("businesses")
    .select("id, business_name, owner_name, email, phone, approval_status, created_at, category_id")
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("approval_status", status);
  }
  if (params.q) {
    query = query.or(`business_name.ilike.%${params.q}%,owner_name.ilike.%${params.q}%,email.ilike.%${params.q}%`);
  }

  const { data: businesses } = await query;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-950">Vendors</h1>
        <p className="mt-1 text-sm text-ink-500">All registered businesses.</p>
      </div>

      <form className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <Link
              key={s}
              href={{
                pathname: "/admin/vendors",
                query: { ...(s !== "all" ? { status: s } : {}), ...(params.q ? { q: params.q } : {}) },
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium",
                status === s ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 text-ink-600 hover:bg-ink-50"
              )}
            >
              {s === "all" ? "All" : APPROVAL_STATUS_LABELS[s]}
            </Link>
          ))}
        </div>
        <div className="flex gap-2">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <Input name="q" defaultValue={params.q} placeholder="Search name, owner, email…" className="sm:w-64" />
        </div>
      </form>

      <Card>
        <CardContent className="p-0">
          <VendorsTable businesses={businesses ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
