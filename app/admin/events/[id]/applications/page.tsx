import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApplicationActions } from "@/components/admin/application-actions";
import { Alert } from "@/components/ui/alert";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { APPLICATION_STATUS_LABELS } from "@/lib/constants";
import { formatAED, formatDate } from "@/lib/format";
import type { ApplicationStatus } from "@/types/database";

export const metadata: Metadata = { title: "Event Applications" };

const STATUS_FILTERS: (ApplicationStatus | "all")[] = [
  "all",
  "submitted",
  "under_review",
  "approved",
  "booth_selection_available",
  "booth_selected",
  "awaiting_payment",
  "payment_under_review",
  "confirmed",
  "rejected",
  "cancelled",
  "expired",
];
const PAGE_SIZE = 50;

export default async function EventApplicationsPage({
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
  const status = (STATUS_FILTERS as string[]).includes(statusParam ?? "")
    ? (statusParam as ApplicationStatus | "all")
    : "all";

  const supabase = await createClient();
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (eventError) throw new Error("Could not load the event applications workspace.");
  if (!event) notFound();

  let query = supabase
    .from("applications")
    .select(
      "id, status, total_amount, submitted_at, created_at, businesses(business_name, owner_name, category_id, categories(name))",
      { count: "exact" }
    )
    .eq("event_id", id)
    .order("created_at", { ascending: false });

  if (status !== "all") query = query.eq("status", status);

  const { data: applications, error, count } = await query.range(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE - 1
  );

  return (
    <div className="page-enter space-y-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-ink-400">
          <Link
            href="/admin/events"
            className="transition-colors hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            Events
          </Link>
          <span aria-hidden="true"> / </span>
          <span className="text-ink-600">{event.name}</span>
        </nav>
        <h1 className="mt-3 font-display text-h2 text-ink-950 sm:text-h1">Applications</h1>
        <p className="mt-2 text-sm text-ink-500">
          Review and approve vendor applications for this event
          {typeof count === "number" ? ` · ${count.toLocaleString("en-US")} matching` : ""}.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by application status">
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={{
              pathname: `/admin/events/${id}/applications`,
              query: s === "all" ? {} : { status: s },
            }}
            aria-current={status === s ? "true" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700",
              status === s
                ? "border-ink-950 bg-ink-950 text-white shadow-sm"
                : "border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900"
            )}
          >
            {s === "all" ? "All" : APPLICATION_STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {error && (
        <Alert variant="error" title="Could not load applications">
          Refresh the page to try again.
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          {!error && !applications?.length ? (
            <EmptyState
              icon={<Icon name="clipboard-list" size="lg" />}
              title="No applications match this filter"
              description={
                status === "all"
                  ? "Applications will appear here as soon as vendors apply to this event."
                  : "Try a different status filter to see every application for this event."
              }
            />
          ) : !error ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-50/50 text-left text-caption font-semibold uppercase tracking-[0.08em] text-ink-400">
                    <th className="px-6 py-3 font-semibold">Business</th>
                    <th className="px-6 py-3 font-semibold">Category</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 font-semibold">Total</th>
                    <th className="px-6 py-3 font-semibold">Applied</th>
                    <th className="px-6 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {applications.map((a) => {
                    const business = a.businesses as unknown as {
                      business_name: string;
                      owner_name: string;
                      categories: { name: string } | null;
                    } | null;
                    return (
                      <tr key={a.id} className="transition-colors hover:bg-ink-50/70">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <span
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-semibold text-brand-700"
                              aria-hidden="true"
                            >
                              {business?.business_name?.trim().charAt(0).toUpperCase() || "•"}
                            </span>
                            <div className="min-w-0">
                              <p className="font-semibold text-ink-900">{business?.business_name}</p>
                              <p className="text-caption text-ink-400">{business?.owner_name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-ink-600">{business?.categories?.name ?? "—"}</td>
                        <td className="px-6 py-4">
                          <Badge className="border-ink-200 bg-ink-50 text-ink-700">
                            {APPLICATION_STATUS_LABELS[a.status]}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 font-medium tabular-nums text-ink-900">
                          {formatAED(a.total_amount)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-ink-500">
                          {formatDate(a.submitted_at ?? a.created_at)}
                        </td>
                        <td className="px-6 py-4">
                          <ApplicationActions applicationId={a.id} eventId={id} status={a.status} totalAmount={a.total_amount} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {!error && (
            <Pagination
              pathname={`/admin/events/${id}/applications`}
              page={page}
              pageSize={PAGE_SIZE}
              total={count ?? 0}
              query={{ status: status === "all" ? undefined : status }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
