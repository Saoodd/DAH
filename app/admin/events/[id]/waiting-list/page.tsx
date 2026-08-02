import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { WaitingListRow } from "@/components/admin/waiting-list-row";
import { SweepInvitationsButton } from "@/components/admin/sweep-invitations-button";
import { formatAED, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Waiting List" };

const STATUS_COLORS: Record<string, string> = {
  waiting: "bg-amber-100 text-amber-800 border-amber-300",
  invited: "bg-blue-100 text-blue-800 border-blue-300",
  accepted: "bg-emerald-100 text-emerald-800 border-emerald-300",
  declined: "bg-neutral-100 text-neutral-600 border-neutral-300",
  expired: "bg-neutral-100 text-neutral-600 border-neutral-300",
  removed: "bg-neutral-100 text-neutral-600 border-neutral-300",
};

export default async function AdminWaitingListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase.from("events").select("id, name").eq("id", id).maybeSingle();
  if (!event) notFound();

  await supabase.rpc("release_expired_invitations", { p_event_id: id });

  const [{ data: entries }, { data: availableBooths }] = await Promise.all([
    supabase
      .from("waiting_list")
      .select("*, businesses(business_name, categories(name))")
      .eq("event_id", id)
      .order("priority", { ascending: false }),
    supabase.from("booths").select("id, booth_number").eq("event_id", id).eq("status", "available").order("booth_number"),
  ]);

  const waitingCount = (entries ?? []).filter((entry) => entry.status === "waiting").length;

  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
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
          <h1 className="mt-3 font-display text-h2 text-ink-950 sm:text-h1">Waiting list</h1>
          <p className="mt-2 text-sm text-ink-500">
            Invitations are ordered by priority — {waitingCount.toLocaleString("en-US")} vendor
            {waitingCount === 1 ? "" : "s"} currently waiting.
          </p>
        </div>
        <SweepInvitationsButton eventId={id} />
      </div>

      <Card>
        <CardContent className="p-0">
          {!entries?.length ? (
            <EmptyState
              icon={<Icon name="clock" size="lg" />}
              title="The waiting list is empty"
              description="Vendors who join the waiting list once booths sell out will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-50/50 text-left text-caption font-semibold uppercase tracking-[0.08em] text-ink-400">
                    <th className="w-12 px-6 py-3 font-semibold">
                      <span aria-hidden="true">#</span>
                      <span className="sr-only">Priority position</span>
                    </th>
                    <th className="px-6 py-3 font-semibold">Business</th>
                    <th className="px-6 py-3 font-semibold">Preference</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 font-semibold">Joined</th>
                    <th className="px-6 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {entries.map((entry, index) => {
                    const business = entry.businesses as unknown as {
                      business_name: string;
                      categories: { name: string } | null;
                    } | null;
                    return (
                      <tr key={entry.id} className="transition-colors hover:bg-ink-50/70">
                        <td className="px-6 py-4 font-medium tabular-nums text-ink-400">{index + 1}</td>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-ink-900">{business?.business_name}</p>
                          <p className="text-caption text-ink-400">{business?.categories?.name ?? ""}</p>
                        </td>
                        <td className="px-6 py-4 text-ink-600">
                          {entry.preferred_booth_size ?? "Any size"}
                          {entry.max_budget ? ` · up to ${formatAED(entry.max_budget)}` : ""}
                        </td>
                        <td className="px-6 py-4">
                          <Badge className={`capitalize ${STATUS_COLORS[entry.status] ?? ""}`}>{entry.status}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-ink-500">{formatDate(entry.joined_at)}</td>
                        <td className="px-6 py-4">
                          <WaitingListRow
                            entryId={entry.id}
                            eventId={id}
                            status={entry.status}
                            notes={entry.admin_notes}
                            availableBooths={availableBooths ?? []}
                          />
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
