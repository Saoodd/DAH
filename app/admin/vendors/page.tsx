import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { APPROVAL_STATUS_COLORS, APPROVAL_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
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

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={s === "all" ? "/admin/vendors" : `/admin/vendors?status=${s}`}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium",
              status === s ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 text-ink-600 hover:bg-ink-50"
            )}
          >
            {s === "all" ? "All" : APPROVAL_STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {!businesses?.length ? (
            <p className="px-6 py-8 text-center text-sm text-ink-400">No vendors match this filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-6 py-3 font-medium">Business</th>
                    <th className="px-6 py-3 font-medium">Contact</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {businesses.map((b) => (
                    <tr key={b.id} className="hover:bg-ink-50">
                      <td className="px-6 py-4">
                        <Link href={`/admin/vendors/${b.id}`} className="font-medium text-ink-900 hover:text-brand-600">
                          {b.business_name}
                        </Link>
                        <p className="text-xs text-ink-400">{b.owner_name}</p>
                      </td>
                      <td className="px-6 py-4 text-ink-600">
                        <p>{b.email}</p>
                        <p className="text-xs text-ink-400">{b.phone}</p>
                      </td>
                      <td className="px-6 py-4">
                        <Badge className={APPROVAL_STATUS_COLORS[b.approval_status]}>
                          {APPROVAL_STATUS_LABELS[b.approval_status]}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-ink-500">{formatDate(b.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
