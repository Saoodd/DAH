import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { APPROVAL_STATUS_COLORS, APPROVAL_STATUS_LABELS, BOOTH_STATUS_LABELS } from "@/lib/constants";
import { formatAED, formatDate } from "@/lib/format";
import type { ApprovalStatus } from "@/types/database";

export const metadata: Metadata = { title: "Admin Dashboard" };

function minutesFromNowIso(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

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

  const { data: openEvent } = await supabase
    .from("events")
    .select("id, name")
    .eq("registration_status", "open")
    .maybeSingle();

  let eventStats: {
    boothCounts: Record<string, number>;
    totalBooths: number;
    capacityPercent: number;
    expectedRevenue: number;
    collectedRevenue: number;
    pendingAmount: number;
    categoryBreakdown: { name: string; count: number }[];
    waitingListSize: number;
    expiringHolds: number;
    recentPayments: { id: string; business_name: string; status: string; amount: number | null; created_at: string }[];
  } | null = null;

  if (openEvent) {
    const [
      { data: booths },
      { data: payments },
      { count: waitingListCount },
      { count: expiringHoldsCount },
      { data: recentPaymentsRaw },
    ] = await Promise.all([
      supabase.from("booths").select("status, price_before_vat").eq("event_id", openEvent.id),
      supabase
        .from("payments")
        .select("status, amount, applications!inner(event_id)")
        .eq("applications.event_id", openEvent.id),
      supabase
        .from("waiting_list")
        .select("*", { count: "exact", head: true })
        .eq("event_id", openEvent.id)
        .eq("status", "waiting"),
      supabase
        .from("booths")
        .select("*", { count: "exact", head: true })
        .eq("event_id", openEvent.id)
        .eq("status", "locked")
        .lt("lock_expires_at", minutesFromNowIso(2)),
      supabase
        .from("payments")
        .select("id, status, amount, created_at, applications!inner(event_id, businesses(business_name))")
        .eq("applications.event_id", openEvent.id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const boothCounts: Record<string, number> = {};
    for (const b of booths ?? []) boothCounts[b.status] = (boothCounts[b.status] ?? 0) + 1;
    const totalBooths = booths?.length ?? 0;
    const confirmedCount = (boothCounts["confirmed"] ?? 0) + (boothCounts["awaiting_payment"] ?? 0) + (boothCounts["reserved"] ?? 0);

    const expectedRevenue = (booths ?? []).reduce((sum, b) => sum + b.price_before_vat, 0);
    const collectedRevenue = (payments ?? []).filter((p) => p.status === "paid").reduce((sum, p) => sum + (p.amount ?? 0), 0);
    const pendingAmount = (payments ?? [])
      .filter((p) => ["payment_required", "pending_payment", "pending_verification"].includes(p.status))
      .reduce((sum, p) => sum + (p.amount ?? 0), 0);

    const { data: categoryRows } = await supabase
      .from("applications")
      .select("businesses(categories(name))")
      .eq("event_id", openEvent.id);
    const categoryCounts = new Map<string, number>();
    for (const row of categoryRows ?? []) {
      const business = row.businesses as unknown as { categories: { name: string } | null } | null;
      const name = business?.categories?.name ?? "Uncategorized";
      categoryCounts.set(name, (categoryCounts.get(name) ?? 0) + 1);
    }

    eventStats = {
      boothCounts,
      totalBooths,
      capacityPercent: totalBooths > 0 ? Math.round((confirmedCount / totalBooths) * 100) : 0,
      expectedRevenue,
      collectedRevenue,
      pendingAmount,
      categoryBreakdown: Array.from(categoryCounts.entries()).map(([name, count]) => ({ name, count })),
      waitingListSize: waitingListCount ?? 0,
      expiringHolds: expiringHoldsCount ?? 0,
      recentPayments: (recentPaymentsRaw ?? []).map((p) => ({
        id: p.id,
        business_name: (p.applications as unknown as { businesses: { business_name: string } | null })?.businesses?.business_name ?? "",
        status: p.status,
        amount: p.amount,
        created_at: p.created_at,
      })),
    };
  }

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

      {eventStats && openEvent && (
        <>
          <div>
            <h2 className="text-lg font-semibold text-ink-950">{openEvent.name}</h2>
            <p className="text-sm text-ink-500">Currently open for registration.</p>
          </div>

          {eventStats.expiringHolds > 0 && (
            <Alert variant="warning" title="Booth holds expiring soon">
              {eventStats.expiringHolds} booth lock(s) expire within 2 minutes.
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <CardContent className="py-5">
                <p className="text-2xl font-semibold text-ink-950">{eventStats.capacityPercent}%</p>
                <p className="mt-1 text-sm text-ink-500">Event capacity</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-5">
                <p className="text-2xl font-semibold text-ink-950">{formatAED(eventStats.expectedRevenue)}</p>
                <p className="mt-1 text-sm text-ink-500">Expected revenue</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-5">
                <p className="text-2xl font-semibold text-emerald-700">{formatAED(eventStats.collectedRevenue)}</p>
                <p className="mt-1 text-sm text-ink-500">Collected</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-5">
                <p className="text-2xl font-semibold text-amber-700">{formatAED(eventStats.pendingAmount)}</p>
                <p className="mt-1 text-sm text-ink-500">Pending</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Booths by status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(eventStats.boothCounts).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span className="text-ink-600">{BOOTH_STATUS_LABELS[status] ?? status}</span>
                    <span className="font-medium text-ink-900">{count}</span>
                  </div>
                ))}
                {eventStats.totalBooths === 0 && <p className="text-sm text-ink-400">No booths created yet.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Category distribution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {eventStats.categoryBreakdown.map((c) => (
                  <div key={c.name} className="flex items-center justify-between text-sm">
                    <span className="text-ink-600">{c.name}</span>
                    <span className="font-medium text-ink-900">{c.count}</span>
                  </div>
                ))}
                {eventStats.categoryBreakdown.length === 0 && <p className="text-sm text-ink-400">No applications yet.</p>}
                <p className="pt-2 text-xs text-ink-400">Waiting list: {eventStats.waitingListSize} vendor(s)</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent payments</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!eventStats.recentPayments.length ? (
                <p className="px-6 py-8 text-center text-sm text-ink-400">No payments yet.</p>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {eventStats.recentPayments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between px-6 py-3 text-sm">
                      <span className="text-ink-800">{p.business_name}</span>
                      <span className="text-ink-500">
                        {formatAED(p.amount)} · {p.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

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
