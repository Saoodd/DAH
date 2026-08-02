import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { StatCard } from "@/components/ui/stat-card";
import { BarList } from "@/components/ui/bar-list";
import { Icon, type IconName } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import {
  APPROVAL_STATUS_COLORS,
  APPROVAL_STATUS_LABELS,
  BOOTH_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
} from "@/lib/constants";
import { formatAED, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ApprovalStatus, BoothStatus, PaymentStatus } from "@/types/database";

export const metadata: Metadata = { title: "Admin Dashboard" };

function minutesFromNowIso(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
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
    icon: IconName;
    tone: "default" | "brand" | "success" | "warning" | "danger";
  }> = [
    { label: "Total businesses", value: total, icon: "building", tone: "default" },
    { label: "Pending review", value: pendingReview, href: "/admin/vendors?status=pending_review", icon: "clock", tone: "warning" },
    { label: "Approved vendors", value: approved, href: "/admin/vendors?status=approved", icon: "circle-check", tone: "success" },
    { label: "Rejected", value: rejected, href: "/admin/vendors?status=rejected", icon: "circle-x", tone: "danger" },
    { label: "Suspended / blacklisted", value: suspendedOrBlacklisted, icon: "shield-check", tone: "default" },
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
    <div className="page-enter space-y-8">
      <div>
        <p className="text-caption font-semibold uppercase tracking-[0.14em] text-brand-700">Admin console</p>
        <h1 className="mt-2 font-display text-h2 text-ink-950 sm:text-h1">Dashboard</h1>
        <p className="mt-2 text-sm text-ink-500">Live counts from the vendor database.</p>
      </div>

      <section aria-labelledby="pipeline-heading">
        <h2
          id="pipeline-heading"
          className="mb-3 text-caption font-semibold uppercase tracking-[0.12em] text-ink-400"
        >
          Vendor pipeline
        </h2>
        <div className="stagger-children grid grid-cols-2 gap-4 lg:grid-cols-5">
          {stats.map((stat) => (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              href={stat.href}
              tone={stat.tone}
              icon={<Icon name={stat.icon} strokeWidth={1.6} />}
            />
          ))}
        </div>
      </section>

      {eventStats && openEvent && (
        <section className="space-y-4" aria-labelledby="open-event-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-caption font-semibold uppercase tracking-[0.12em] text-ink-400">Open event</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                <h2 id="open-event-heading" className="font-display text-h3 text-ink-950">
                  {openEvent.name}
                </h2>
                <Badge className="border-emerald-300 bg-emerald-100 text-emerald-800">Open for registration</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-500">Live snapshot of booths, revenue, and applications.</p>
            </div>
            <Link
              href={`/admin/events/${openEvent.id}/edit`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Manage event
              <Icon name="arrow-right" size="sm" />
            </Link>
          </div>

          {eventStats.expiringHolds > 0 && (
            <Alert variant="warning" title="Booth holds expiring soon">
              {eventStats.expiringHolds} booth lock(s) expire within 2 minutes.
            </Alert>
          )}

          <div className="stagger-children grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Event capacity" value={`${eventStats.capacityPercent}%`} icon={<Icon name="chart-up" strokeWidth={1.6} />} tone="brand" />
            <StatCard label="Expected revenue" value={formatAED(eventStats.expectedRevenue)} icon={<Icon name="banknotes" strokeWidth={1.6} />} tone="default" />
            <StatCard label="Collected" value={formatAED(eventStats.collectedRevenue)} icon={<Icon name="circle-check" strokeWidth={1.6} />} tone="success" />
            <StatCard label="Pending" value={formatAED(eventStats.pendingAmount)} icon={<Icon name="clock" strokeWidth={1.6} />} tone="warning" />
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
                <p className="mt-4 border-t border-ink-100 pt-3 text-caption text-ink-400">
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
                <EmptyState
                  icon={<Icon name="credit-card" size="lg" />}
                  title="No payments yet"
                  description="Payments appear here as soon as vendors start checking out."
                />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {eventStats.recentPayments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-6 py-3.5 text-sm transition-colors hover:bg-ink-50/60">
                      <span className="font-medium text-ink-800">{p.business_name}</span>
                      <span className="flex items-center gap-2.5">
                        <span className="tabular-nums text-ink-500">{formatAED(p.amount)}</span>
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
            <Link
              href="/admin/vendors"
              className="flex items-center gap-1.5 text-sm font-medium text-brand-700 transition-colors hover:text-brand-800"
            >
              View all
              <Icon name="arrow-right" size="xs" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {!recent.data?.length ? (
              <EmptyState
                icon={<Icon name="users" size="lg" />}
                title="No businesses yet"
                description="New vendor registrations will appear here as they sign up."
              />
            ) : (
              <ul className="divide-y divide-ink-100">
                {recent.data.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/admin/vendors/${b.id}`}
                      className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-ink-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700"
                    >
                      <span className="flex min-w-0 items-center gap-3.5">
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-semibold text-brand-700"
                          aria-hidden="true"
                        >
                          {b.business_name.trim().charAt(0).toUpperCase() || "•"}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-ink-900">{b.business_name}</span>
                          <span className="block text-caption text-ink-400">
                            {b.owner_name} · {formatDate(b.created_at)}
                          </span>
                        </span>
                      </span>
                      <Badge className={cn("shrink-0", APPROVAL_STATUS_COLORS[b.approval_status])}>
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
