import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApplicationActions } from "@/components/admin/application-actions";
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

export default async function EventApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  const { status: statusParam } = await searchParams;
  const status = (STATUS_FILTERS as string[]).includes(statusParam ?? "")
    ? (statusParam as ApplicationStatus | "all")
    : "all";

  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id, name").eq("id", id).maybeSingle();
  if (!event) notFound();

  let query = supabase
    .from("applications")
    .select("id, status, total_amount, submitted_at, created_at, businesses(business_name, owner_name, category_id, categories(name))")
    .eq("event_id", id)
    .order("created_at", { ascending: false });

  if (status !== "all") query = query.eq("status", status);

  const { data: applications } = await query;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-400">
          <Link href="/admin/events" className="hover:text-brand-600">
            Events
          </Link>{" "}
          / {event.name}
        </p>
        <h1 className="text-2xl font-semibold text-ink-950">Applications</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={s === "all" ? `/admin/events/${id}/applications` : `/admin/events/${id}/applications?status=${s}`}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium",
              status === s ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 text-ink-600 hover:bg-ink-50"
            )}
          >
            {s === "all" ? "All" : APPLICATION_STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {!applications?.length ? (
            <p className="px-6 py-8 text-center text-sm text-ink-400">No applications match this filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-6 py-3 font-medium">Business</th>
                    <th className="px-6 py-3 font-medium">Category</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Total</th>
                    <th className="px-6 py-3 font-medium">Applied</th>
                    <th className="px-6 py-3 font-medium">Actions</th>
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
                      <tr key={a.id} className="hover:bg-ink-50">
                        <td className="px-6 py-4">
                          <p className="font-medium text-ink-900">{business?.business_name}</p>
                          <p className="text-xs text-ink-400">{business?.owner_name}</p>
                        </td>
                        <td className="px-6 py-4 text-ink-600">{business?.categories?.name ?? "—"}</td>
                        <td className="px-6 py-4">
                          <Badge className="border-ink-200 bg-ink-50 text-ink-700">
                            {APPLICATION_STATUS_LABELS[a.status]}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-ink-600">{formatAED(a.total_amount)}</td>
                        <td className="px-6 py-4 text-ink-500">{formatDate(a.submitted_at ?? a.created_at)}</td>
                        <td className="px-6 py-4">
                          <ApplicationActions applicationId={a.id} eventId={id} status={a.status} totalAmount={a.total_amount} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
