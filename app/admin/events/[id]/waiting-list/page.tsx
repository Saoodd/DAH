import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
          <h1 className="text-2xl font-semibold text-ink-950">Waiting list</h1>
        </div>
        <SweepInvitationsButton eventId={id} />
      </div>

      <Card>
        <CardContent className="p-0">
          {!entries?.length ? (
            <p className="px-6 py-8 text-center text-sm text-ink-400">No vendors on the waiting list.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-6 py-3 font-medium">Business</th>
                    <th className="px-6 py-3 font-medium">Preference</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Joined</th>
                    <th className="px-6 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {entries.map((entry) => {
                    const business = entry.businesses as unknown as {
                      business_name: string;
                      categories: { name: string } | null;
                    } | null;
                    return (
                      <tr key={entry.id} className="hover:bg-ink-50">
                        <td className="px-6 py-4">
                          <p className="font-medium text-ink-900">{business?.business_name}</p>
                          <p className="text-xs text-ink-400">{business?.categories?.name ?? ""}</p>
                        </td>
                        <td className="px-6 py-4 text-ink-600">
                          {entry.preferred_booth_size ?? "Any size"}
                          {entry.max_budget ? ` · up to ${formatAED(entry.max_budget)}` : ""}
                        </td>
                        <td className="px-6 py-4">
                          <Badge className={STATUS_COLORS[entry.status]}>{entry.status}</Badge>
                        </td>
                        <td className="px-6 py-4 text-ink-500">{formatDate(entry.joined_at)}</td>
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
