import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { APPROVAL_STATUS_COLORS, APPROVAL_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { ApprovalStatus } from "@/types/database";

export const metadata: Metadata = { title: "Admin Dashboard" };

async function countByStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  status: ApprovalStatus
) {
  const { count } = await supabase
    .from("businesses")
    .select("*", { count: "exact", head: true })
    .eq("approval_status", status);
  return count ?? 0;
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [total, pendingReview, approved, rejected, suspendedOrBlacklisted, recent] = await Promise.all([
    supabase.from("businesses").select("*", { count: "exact", head: true }).then((r) => r.count ?? 0),
    countByStatus(supabase, "pending_review"),
    countByStatus(supabase, "approved"),
    countByStatus(supabase, "rejected"),
    supabase
      .from("businesses")
      .select("*", { count: "exact", head: true })
      .in("approval_status", ["suspended", "blacklisted"])
      .then((r) => r.count ?? 0),
    supabase
      .from("businesses")
      .select("id, business_name, owner_name, approval_status, created_at")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const stats = [
    { label: "Total businesses", value: total },
    { label: "Pending review", value: pendingReview, href: "/admin/vendors?status=pending_review" },
    { label: "Approved vendors", value: approved, href: "/admin/vendors?status=approved" },
    { label: "Rejected", value: rejected, href: "/admin/vendors?status=rejected" },
    { label: "Suspended / blacklisted", value: suspendedOrBlacklisted },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-950">Admin dashboard</h1>
        <p className="mt-1 text-sm text-ink-500">Live counts from the vendor database.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {stats.map((stat) => {
          const content = (
            <Card key={stat.label} className="h-full">
              <CardContent className="py-5">
                <p className="text-2xl font-semibold text-ink-950">{stat.value}</p>
                <p className="mt-1 text-sm text-ink-500">{stat.label}</p>
              </CardContent>
            </Card>
          );
          return stat.href ? (
            <Link key={stat.label} href={stat.href} className="block">
              {content}
            </Link>
          ) : (
            content
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent registrations</CardTitle>
          <Link href="/admin/vendors" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            View all
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {!recent.data?.length ? (
            <p className="px-6 py-8 text-center text-sm text-ink-400">No businesses have signed up yet.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {recent.data.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/admin/vendors/${b.id}`}
                    className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-ink-50"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink-900">{b.business_name}</p>
                      <p className="text-xs text-ink-400">
                        {b.owner_name} · {formatDate(b.created_at)}
                      </p>
                    </div>
                    <Badge className={APPROVAL_STATUS_COLORS[b.approval_status]}>
                      {APPROVAL_STATUS_LABELS[b.approval_status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
