import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EventForm } from "@/components/forms/event-form";
import { EventActions } from "@/components/admin/event-actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/ui/icon";
import { EVENT_STATUS_COLORS, EVENT_STATUS_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "Edit Event" };

const WORKSPACE_LINKS: Array<{ segment: string; label: string; icon: IconName }> = [
  { segment: "booths", label: "Booth map", icon: "map" },
  { segment: "recommendations", label: "Recommendations", icon: "chart-up" },
  { segment: "applications", label: "Applications", icon: "clipboard-list" },
  { segment: "payments", label: "Payments", icon: "credit-card" },
  { segment: "waiting-list", label: "Waiting list", icon: "clock" },
  { segment: "setup", label: "Setup check-in", icon: "circle-check" },
];

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("*").eq("id", id).maybeSingle();

  if (!event) notFound();

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
        <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-h2 text-ink-950 sm:text-h1">{event.name}</h1>
            <Badge className={EVENT_STATUS_COLORS[event.registration_status]}>
              {EVENT_STATUS_LABELS[event.registration_status]}
            </Badge>
          </div>
          <EventActions eventId={event.id} status={event.registration_status} />
        </div>
        <nav aria-label="Event workspace" className="mt-4 flex flex-wrap gap-2">
          {WORKSPACE_LINKS.map((link) => (
            <Link
              key={link.segment}
              href={`/admin/events/${event.id}/${link.segment}`}
              className="flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
            >
              <Icon name={link.icon} size="xs" strokeWidth={1.6} />
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Event details</CardTitle>
          <CardDescription>Changes apply immediately, even while registration is open.</CardDescription>
        </CardHeader>
        <CardContent className="p-6 sm:p-8">
          <EventForm
            eventId={event.id}
            bannerUrl={event.banner_url}
            defaultValues={{
              name: event.name,
              location: event.location ?? "",
              description: event.description ?? "",
              vendorRules: event.vendor_rules ?? "",
              setupInstructions: event.setup_instructions ?? "",
              startAt: event.start_at,
              endAt: event.end_at,
              setupStartAt: event.setup_start_at,
              setupEndAt: event.setup_end_at,
              registrationOpensAt: event.registration_opens_at,
              registrationClosesAt: event.registration_closes_at,
              paymentDeadlineMinutes: event.payment_deadline_minutes,
              boothLockMinutes: event.booth_lock_minutes,
              recommendationsEnabled: event.recommendations_enabled,
              boothChangesLocked: event.booth_changes_locked,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
