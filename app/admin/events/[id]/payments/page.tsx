import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PaymentActions } from "@/components/admin/payment-actions";
import { SweepExpiredButton } from "@/components/admin/sweep-expired-button";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { PAYMENT_STATUS_COLORS, PAYMENT_STATUS_LABELS } from "@/lib/constants";
import { formatAED, formatDate } from "@/lib/format";
import { getSignedFileUrl } from "@/lib/storage";
import type { PaymentStatus } from "@/types/database";

export const metadata: Metadata = { title: "Payments" };

const STATUS_FILTERS: (PaymentStatus | "all")[] = [
  "all",
  "payment_required",
  "pending_payment",
  "pending_verification",
  "paid",
  "expired",
  "refunded",
  "partially_refunded",
];
const PAGE_SIZE = 50;
const METRIC_PAGE_SIZE = 1000;
const METRIC_ROW_LIMIT = 100_000;

async function loadPaymentMetrics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string
) {
  const rows: Array<{ status: PaymentStatus; amount: number | null; refund_amount: number | null }> = [];
  for (let from = 0; from < METRIC_ROW_LIMIT; from += METRIC_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("payments")
      .select("status, amount, refund_amount, applications!inner(event_id)")
      .eq("applications.event_id", eventId)
      .order("id")
      .range(from, from + METRIC_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []).map((payment) => ({
      status: payment.status,
      amount: payment.amount,
      refund_amount: payment.refund_amount,
    }));
    rows.push(...page);
    if (page.length < METRIC_PAGE_SIZE) return rows;
  }
  throw new Error("Payment metrics exceed the 100,000-row safety limit.");
}

export default async function EventPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { id } = await params;
  const { status: statusParam, page: pageParam } = await searchParams;
  const parsedPage = Number.parseInt(pageParam ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const status = (STATUS_FILTERS as string[]).includes(statusParam ?? "") ? (statusParam as PaymentStatus | "all") : "all";

  const supabase = await createClient();
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (eventError) throw new Error("Could not load the event payment workspace.");
  if (!event) notFound();

  const { error: sweepError } = await supabase.rpc("expire_overdue_payments", { p_event_id: id });
  if (sweepError) throw new Error("Could not refresh overdue payments.");

  let query = supabase
    .from("payments")
    .select(
      "id, status, method, amount, payment_link, payment_reference, receipt_url, transfer_reference, transfer_date, deadline_at, notes, applications!inner(id, event_id, booth_id, businesses(business_name), booths(booth_number))",
      { count: "exact" }
    )
    .eq("applications.event_id", id)
    .order("created_at", { ascending: false });

  if (status !== "all") query = query.eq("status", status);

  const [paymentsResult, metricsResult] = await Promise.all([
    query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    loadPaymentMetrics(supabase, id).then(
      (data) => ({ data, error: null }),
      (error: unknown) => ({ data: null, error })
    ),
  ]);
  if (paymentsResult.error || metricsResult.error) {
    throw new Error("Could not load event payments. Please try again.");
  }

  const payments = await Promise.all(
    (paymentsResult.data ?? []).map(async (payment) => ({
      ...payment,
      receiptSignedUrl: payment.receipt_url
        ? await getSignedFileUrl(supabase, "payment-receipts", payment.receipt_url)
        : null,
    }))
  );
  const metricPayments = metricsResult.data;

  const totalCollected = (metricPayments ?? []).reduce((sum, payment) => {
    if (payment.status === "paid") return sum + (payment.amount ?? 0);
    if (payment.status === "partially_refunded") {
      return sum + Math.max(0, (payment.amount ?? 0) - (payment.refund_amount ?? 0));
    }
    return sum;
  }, 0);
  const totalPending = (metricPayments ?? [])
    .filter((p) => ["payment_required", "pending_payment", "pending_verification"].includes(p.status))
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-ink-400">
            <Link href="/admin/events" className="hover:text-brand-600">
              Events
            </Link>{" "}
            / {event.name}
          </p>
          <h1 className="text-2xl font-semibold text-ink-950">Payments</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/admin/bank-details`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Bank details
          </Link>
          <SweepExpiredButton eventId={id} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="py-5">
            <p className="text-2xl font-semibold text-ink-950">{formatAED(totalCollected)}</p>
            <p className="mt-1 text-sm text-ink-500">Collected</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-2xl font-semibold text-ink-950">{formatAED(totalPending)}</p>
            <p className="mt-1 text-sm text-ink-500">Pending</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={s === "all" ? `/admin/events/${id}/payments` : `/admin/events/${id}/payments?status=${s}`}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium",
              status === s ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 text-ink-600 hover:bg-ink-50"
            )}
          >
            {s === "all" ? "All" : PAYMENT_STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {!payments.length ? (
            <p className="px-6 py-8 text-center text-sm text-ink-400">No payments match this filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-6 py-3 font-medium">Business</th>
                    <th className="px-6 py-3 font-medium">Booth</th>
                    <th className="px-6 py-3 font-medium">Amount</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Deadline</th>
                    <th className="px-6 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {payments.map((p) => {
                    const application = p.applications as unknown as {
                      businesses: { business_name: string } | null;
                      booths: { booth_number: string } | null;
                    };
                    return (
                      <tr key={p.id} className="hover:bg-ink-50">
                        <td className="px-6 py-4 font-medium text-ink-900">{application?.businesses?.business_name}</td>
                        <td className="px-6 py-4 text-ink-600">{application?.booths?.booth_number ?? "—"}</td>
                        <td className="px-6 py-4 text-ink-600">{formatAED(p.amount)}</td>
                        <td className="px-6 py-4">
                          <Badge className={PAYMENT_STATUS_COLORS[p.status]}>{PAYMENT_STATUS_LABELS[p.status]}</Badge>
                        </td>
                        <td className="px-6 py-4 text-ink-500">{p.deadline_at ? formatDate(p.deadline_at) : "—"}</td>
                        <td className="px-6 py-4">
                          <PaymentActions
                            paymentId={p.id}
                            eventId={id}
                            status={p.status}
                            amount={p.amount}
                            paymentLink={p.payment_link}
                            notes={p.notes}
                            receiptUrl={p.receiptSignedUrl}
                            hasReceipt={Boolean(p.receipt_url)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            pathname={`/admin/events/${id}/payments`}
            page={page}
            pageSize={PAGE_SIZE}
            total={paymentsResult.count ?? 0}
            query={{ status: status === "all" ? undefined : status }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
