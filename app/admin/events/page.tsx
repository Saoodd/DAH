import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EventActions } from "@/components/admin/event-actions";
import { Alert } from "@/components/ui/alert";
import { Icon, type IconName } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { EVENT_STATUS_COLORS, EVENT_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Events" };
const PAGE_SIZE = 50;

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const parsedPage = Number.parseInt(pageParam ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const supabase = await createClient();
  const { data: events, error, count } = await supabase
    .from("events")
    .select("id, name, location, registration_status, start_at, end_at, is_archived", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const quickLinks: Array<{ segment: string; label: string; icon: IconName }> = [
    { segment: "booths", label: "Booth map", icon: "map" },
    { segment: "applications", label: "Applications", icon: "clipboard-list" },
    { segment: "payments", label: "Payments", icon: "credit-card" },
  ];

  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-caption font-semibold uppercase tracking-[0.14em] text-brand-700">Admin console</p>
          <h1 className="mt-2 font-display text-h2 text-ink-950 sm:text-h1">Events</h1>
          <p className="mt-2 text-sm text-ink-500">Only one event can be open for registration at a time.</p>
        </div>
        <Link href="/admin/events/new" className={buttonVariants({ variant: "primary", className: "shrink-0" })}>
          <Icon name="plus" size="sm" />
          Create event
        </Link>
      </div>

      {error ? (
        <Alert variant="error" title="Could not load events">
          Refresh the page to try again.
        </Alert>
      ) : !events?.length ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<Icon name="calendar" size="lg" />}
              title="No events yet"
              description="Create your first Dar Al Hay event to open registration, lay out the booth map, and start accepting vendors."
              action={
                <Link href="/admin/events/new" className={buttonVariants({ size: "sm" })}>
                  <Icon name="plus" size="sm" />
                  Create event
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="stagger-children space-y-4">
          {events.map((event) => (
            <Card key={event.id} className="hover-lift">
              <CardContent className="flex flex-col justify-between gap-5 py-5 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Link
                      href={`/admin/events/${event.id}/edit`}
                      className="font-display text-h4 text-ink-950 transition-colors hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                    >
                      {event.name}
                    </Link>
                    <Badge className={EVENT_STATUS_COLORS[event.registration_status]}>
                      {EVENT_STATUS_LABELS[event.registration_status]}
                    </Badge>
                  </div>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
                    <span className="flex items-center gap-1.5">
                      <Icon name="map-pin" size="xs" strokeWidth={1.5} className="text-ink-400" />
                      {event.location ?? "No location set"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Icon name="calendar" size="xs" strokeWidth={1.5} className="text-ink-400" />
                      {formatDate(event.start_at)} – {formatDate(event.end_at)}
                    </span>
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {quickLinks.map((link) => (
                      <Link
                        key={link.segment}
                        href={`/admin/events/${event.id}/${link.segment}`}
                        className="flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                      >
                        <Icon name={link.icon} size="xs" strokeWidth={1.6} />
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
                <EventActions eventId={event.id} status={event.registration_status} compact />
              </CardContent>
            </Card>
          ))}
          {(count ?? 0) > PAGE_SIZE && (
            <Card>
              <CardContent className="p-0">
                <Pagination
                  pathname="/admin/events"
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={count ?? 0}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
