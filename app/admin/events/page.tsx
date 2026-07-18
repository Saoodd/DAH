import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EventActions } from "@/components/admin/event-actions";
import { EVENT_STATUS_COLORS, EVENT_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Events" };

export default async function AdminEventsPage() {
  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events")
    .select("id, name, location, registration_status, start_at, end_at, is_archived")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-ink-950">Events</h1>
          <p className="mt-1 text-sm text-ink-500">Only one event can be open for registration at a time.</p>
        </div>
        <Link href="/admin/events/new" className={buttonVariants({ variant: "primary" })}>
          Create event
        </Link>
      </div>

      {!events?.length ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-ink-400">
            No events yet. Create your first Dar Al Hay event to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {events.map((event) => (
            <Card key={event.id}>
              <CardContent className="flex flex-col justify-between gap-4 py-5 sm:flex-row sm:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/events/${event.id}/edit`} className="font-semibold text-ink-900 hover:text-brand-600">
                      {event.name}
                    </Link>
                    <Badge className={EVENT_STATUS_COLORS[event.registration_status]}>
                      {EVENT_STATUS_LABELS[event.registration_status]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-500">
                    {event.location ?? "No location set"} · {formatDate(event.start_at)} – {formatDate(event.end_at)}
                  </p>
                  <div className="mt-1 flex gap-4">
                    <Link href={`/admin/events/${event.id}/booths`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                      Booth map
                    </Link>
                    <Link href={`/admin/events/${event.id}/applications`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                      View applications
                    </Link>
                    <Link href={`/admin/events/${event.id}/payments`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                      Payments
                    </Link>
                  </div>
                </div>
                <EventActions eventId={event.id} status={event.registration_status} compact />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
