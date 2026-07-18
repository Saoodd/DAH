import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EventForm } from "@/components/forms/event-form";
import { EventActions } from "@/components/admin/event-actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EVENT_STATUS_COLORS, EVENT_STATUS_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "Edit Event" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("*").eq("id", id).maybeSingle();

  if (!event) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-ink-950">{event.name}</h1>
            <Badge className={EVENT_STATUS_COLORS[event.registration_status]}>
              {EVENT_STATUS_LABELS[event.registration_status]}
            </Badge>
          </div>
          <div className="flex gap-4">
            <Link href={`/admin/events/${event.id}/booths`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
              Booth map
            </Link>
            <Link href={`/admin/events/${event.id}/recommendations`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
              Recommendations
            </Link>
            <Link href={`/admin/events/${event.id}/applications`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
              View applications
            </Link>
          </div>
        </div>
        <EventActions eventId={event.id} status={event.registration_status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Event details</CardTitle>
          <CardDescription>Changes apply immediately, even while registration is open.</CardDescription>
        </CardHeader>
        <CardContent>
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
