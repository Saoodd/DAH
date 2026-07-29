import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { StatCard } from "@/components/ui/stat-card";
import { BarList } from "@/components/ui/bar-list";
import {
  APPROVAL_STATUS_COLORS,
  APPROVAL_STATUS_LABELS,
  BOOTH_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
} from "@/lib/constants";
import { formatAED, formatDate } from "@/lib/format";
import type { ApprovalStatus, BoothStatus, PaymentStatus } from "@/types/database";

export const metadata: Metadata = { title: "Admin Dashboard" };

function minutesFromNowIso(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

const icons = {
  building: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
    />
  ),
  clock: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />,
  check: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m6.75 2.25a10 10 0 11-20 0 10 10 0 0120 0z" />,
  x: <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
  shield: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12.75L11.25 15 15 9.75m5.706-3.905a1.5 1.5 0 00-1.5-1.5H4.794a1.5 1.5 0 00-1.5 1.5v.75a15.75 15.75 0 008.706 14.14 1.5 1.5 0 001-.001A15.75 15.75 0 0020.706 7.6v-.75z"
    />
  ),
  chart: <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5l4.5-4.5 4 4L21 4m0 0h-5.25M21 4v5.25M3 20.25h18" />,
  cash: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.25 8.25h19.5M2.25 8.25v10.5a1.5 1.5 0 001.5 1.5h16.5a1.5 1.5 0 001.5-1.5V8.25M2.25 8.25l1.72-3.44a1.5 1.5 0 011.34-.81h13.38a1.5 1.5 0 011.34.81l1.72 3.44M12 15a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z"
    />
  ),
};

function Icon({ path }: { path: ReactNode }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      {path}
    </svg>
  );
}

async function countByStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  status: ApprovalStatus
) {
  const { count, error } = await supabase
    .from("businesses")
    .select("*", { count: "exact", head: true })
    .eq("approval_status", status);
  if (error) throw error;
  return count ?? 0;
}

const METRIC_PAGE_SIZE = 1000;
const METRIC_ROW_LIMIT = 100_000;

async function loadBoothMetrics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string
): Promise<Array<{ status: BoothStatus; price_before_vat: number }>> {
  const rows: Array<{ status: BoothStatus; price_before_vat: number }> = [];
  for (let from = 0; from < METRIC_ROW_LIMIT; from += METRIC_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("booths")
      .select("status, price_before_vat")
      .eq("event_id", eventId)
      .order("id")
      .range(from, from + METRIC_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < METRIC_PAGE_SIZE) return rows;
  }
  throw new Error("Booth metrics exceed the 100,000-row safety limit.");
}

async function loadPaymentMetrics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string
): Promise<Array<{ status: PaymentStatus; amount: number | null; refund_amount: number | null }>> {
  const rows: Array<{ status: PaymentStatus; amount: number | null; refund_amount: number | null }> = [];
  for (let from = 0; from < METRIC_ROW_LIMIT; from += METRIC_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("payments")
      .select("status, amount, refund_amount, applications!inner(event_id)")
      .eq("applications.event_id", eventId)
      .order("id")
      .range(from, from + METRIC_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []).map(({ status, amount, refund_amount }) => ({ status, amount, refund_amount }));
    rows.push(...page);
    if (page.length < METRIC_PAGE_SIZE) return rows;
  }
  throw new Error("Payment metrics exceed the 100,000-row safety limit.");
}

async function loadCategoryMetrics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string
): Promise<string[]> {
  const names: string[] = [];
  for (let from = 0; from < METRIC_ROW_LIMIT; from += METRIC_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("applications")
      .select("businesses(categories(name))")
      .eq("event_id", eventId)
      .order("id")
      .range(from, from + METRIC_PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      const business = row.businesses as unknown as { categories: { name: string } | null } | null;
      names.push(business?.categories?.name ?? "Uncategorized");
    }
    if ((data?.length ?? 0) < METRIC_PAGE_SIZE) return names;
  }
  throw new Error("Category metrics exceed the 100,000-row safety limit.");
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [total, pendingReview, approved, rejected, suspendedOrBlacklisted, recent] = await Promise.all([
    supabase
      .from("businesses")
      .select("*", { count: "exact", head: true })
      .then((result) => {
        if (result.error) throw result.error;
        return result.count ?? 0;
      }),
    countByStatus(supabase, "pending_review"),

    countByStatus(supabase, "approved"),
    countByStatus(supabase, "rejected"),
    supabase
      .from("businesses")
      .select("*", { count: "exact", head: true })
      .in("approval_status", ["suspended", "blacklisted"])
      .then((result) => {
        if (result.error) throw result.error;
        return result.count ?? 0;
      }),
    supabase
      .from("businesses")
      .select("id, business_name, owner_name, approval_status, created_at")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);
  if (recent.error) throw new Error("Could not load the vendor dashboard.");

  const stats: Array<{
    label: string;
    value: number;
    href?: string;
    icon: ReactNode;
    tone: "default" | "brand" | "success" | "warning" | "danger";
  }> = [
    { label: "Total businesses", value: total, icon: icons.building, tone: "default" },
    { label: "Pending review", value: pendingReview, href: "/admin/vendors?status=pending_review", icon: icons.clock, tone: "warning" },
    { label: "Approved vendors", value: approved, href: "/admin/vendors?status=approved", icon: icons.check, tone: "success" },
    { label: "Rejected", value: rejected, href: "/admin/vendors?status=rejected", icon: icons.x, tone: "danger" },
    { label: "Suspended / blacklisted", value: suspendedOrBlacklisted, icon: icons.shield, tone: "default" },
  ];

  const { data: openEvent, error: openEventError } = await supabase
    .from("events")
    .select("id, name")
    .eq("registration_status", "open")
    .order("starts_at", { ascending: true })
    .limit(1)

    .maybeSingle();
  if (openEventError) throw new Error("Could not load the active event dashboard.");


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
      booths,
      payments,
      waitingListResult,
      expiringHoldsResult,
      recentPaymentsResult,
      categoryRows,
    ] = await Promise.all([
      loadBoothMetrics(supabase, openEvent.id),
      loadPaymentMetrics(supabase, openEvent.id),
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
      loadCategoryMetrics(supabase, openEvent.id),
    ]);

    const waitingListCount = waitingListResult.count;
    if (waitingListResult.error || expiringHoldsResult.error || recentPaymentsResult.error) {
      throw new Error("Could not load the active event metrics.");
    }
    const expiringHoldsCount = expiringHoldsResult.count;
    const recentPaymentsRaw = recentPaymentsResult.data;

    const boothCounts: Record<string, number> = {};
    for (const b of booths) boothCounts[b.status] = (boothCounts[b.status] ?? 0) + 1;
    const totalBooths = booths.length;
    const confirmedCount = (boothCounts["confirmed"] ?? 0) + (boothCounts["awaiting_payment"] ?? 0) + (boothCounts["reserved"] ?? 0);

    const expectedRevenue = booths.reduce((sum, b) => sum + b.price_before_vat, 0);
    const collectedRevenue = payments.reduce((sum, payment) => {
      if (payment.status === "paid") return sum + (payment.amount ?? 0);
      if (payment.status === "partially_refunded") {
        return sum + Math.max(0, (payment.amount ?? 0) - (payment.refund_amount ?? 0));
      }
      return sum;
    }, 0);
    const pendingAmount = payments
      .filter((p) => ["payment_required", "pending_payment", "pending_verification"].includes(p.status))
      .reduce((sum, p) => sum + (p.amount ?? 0), 0);

    const categoryCounts = new Map<string, number>();
    for (const name of categoryRows) {
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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Admin dashboard</h1>
        <p className="mt-1 text-sm text-ink-500">Live counts from the vendor database.</p>
      </div>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">Vendor pipeline</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {stats.map((stat) => (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              href={stat.href}
              tone={stat.tone}
              icon={<Icon path={stat.icon} />}
            />
          ))}
        </div>
      </section>

      {eventStats && openEvent && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight text-ink-950">{openEvent.name}</h2>
                <Badge className="border-emerald-300 bg-emerald-100 text-emerald-800">Open for registration</Badge>
              </div>
              <p className="text-sm text-ink-500">Live snapshot of booths, revenue, and applications.</p>
            </div>
            <Link
              href={`/admin/events/${openEvent.id}/edit`}
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Manage event →
            </Link>
          </div>

          {eventStats.expiringHolds > 0 && (
            <Alert variant="warning" title="Booth holds expiring soon">
              {eventStats.expiringHolds} booth lock(s) expire within 2 minutes.
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Event capacity" value={`${eventStats.capacityPercent}%`} icon={<Icon path={icons.chart} />} tone="brand" />
            <StatCard label="Expected revenue" value={formatAED(eventStats.expectedRevenue)} icon={<Icon path={icons.cash} />} tone="default" />
            <StatCard label="Collected" value={formatAED(eventStats.collectedRevenue)} icon={<Icon path={icons.check} />} tone="success" />
            <StatCard label="Pending" value={formatAED(eventStats.pendingAmount)} icon={<Icon path={icons.clock} />} tone="warning" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Booths by status</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList
                  emptyLabel="No booths created yet."
                  items={Object.entries(eventStats.boothCounts).map(([status, count]) => ({
                    label: BOOTH_STATUS_LABELS[status] ?? status,
                    value: count,
                  }))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Category distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList
                  emptyLabel="No applications yet."
                  items={eventStats.categoryBreakdown.map((c) => ({ label: c.name, value: c.count }))}
                />
                <p className="mt-4 border-t border-ink-100 pt-3 text-xs text-ink-400">
                  Waiting list: <span className="font-medium text-ink-600">{eventStats.waitingListSize} vendor(s)</span>
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent payments</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!eventStats.recentPayments.length ? (
                <p className="px-6 py-10 text-center text-sm text-ink-400">No payments yet.</p>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {eventStats.recentPayments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-6 py-3.5 text-sm transition-colors hover:bg-ink-50/60">
                      <span className="font-medium text-ink-800">{p.business_name}</span>
                      <span className="flex items-center gap-2.5">
                        <span className="text-ink-500">{formatAED(p.amount)}</span>
                        <Badge className={PAYMENT_STATUS_COLORS[p.status] ?? ""}>
                          {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <section>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent registrations</CardTitle>
            <Link href="/admin/vendors" className="text-sm font-medium text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {!recent.data?.length ? (
              <p className="px-6 py-10 text-center text-sm text-ink-400">No businesses have signed up yet.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {recent.data.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/admin/vendors/${b.id}`}
                      className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-ink-50/60"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-900">{b.business_name}</p>
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
      </section>
    </div>
  );
}
