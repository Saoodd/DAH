import Link from "next/link";
import type { Metadata } from "next";
import { requireOwnedBusiness } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { FloorPlan, type BoothWithRecommendation } from "@/components/vendor/floor-plan";
import { WaitingListPanel } from "@/components/vendor/waiting-list-panel";
import { getBoothRecommendation, getNearbyOccupants } from "@/lib/recommendations";
import { APPLICATION_STATUS_LABELS } from "@/lib/constants";
import { isEventActive, isEventRegistrationOpen } from "@/lib/event-registration";
import type { Database } from "@/types/database";

type BoothEvent = Pick<
  Database["public"]["Tables"]["events"]["Row"],
  | "id"
  | "name"
  | "booth_lock_minutes"
  | "recommendations_enabled"
  | "registration_status"
  | "registration_opens_at"
  | "registration_closes_at"
  | "end_at"
  | "is_archived"
>;
type BoothApplication = Pick<
  Database["public"]["Tables"]["applications"]["Row"],
  "id" | "status" | "booth_id" | "event_id"
>;

export const metadata: Metadata = { title: "Select Your Booth" };
export const dynamic = "force-dynamic";

export default async function VendorBoothsPage() {
  const business = await requireOwnedBusiness();
  const supabase = await createClient();

  let event: BoothEvent | null = null;
  let application: BoothApplication | null = null;

  const { data: activeBoothApplication } = await supabase
    .from("applications")
    .select("id, status, booth_id, event_id")
    .eq("business_id", business.id)
    .in("status", ["booth_selected", "awaiting_payment"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeBoothApplication) {
    const { data: activeEvent } = await supabase
      .from("events")
      .select(
        "id, name, booth_lock_minutes, recommendations_enabled, registration_status, registration_opens_at, registration_closes_at, end_at, is_archived"
      )
      .eq("id", activeBoothApplication.event_id)
      .maybeSingle();

    if (activeEvent && isEventActive(activeEvent)) {
      event = activeEvent;
      application = activeBoothApplication;
    }
  }

  const { data: configuredOpenEvent } = await supabase
    .from("events")
    .select(
      "id, name, booth_lock_minutes, recommendations_enabled, registration_status, registration_opens_at, registration_closes_at, end_at, is_archived"
    )
    .eq("registration_status", "open")
    .maybeSingle();

  if (!event && configuredOpenEvent && isEventRegistrationOpen(configuredOpenEvent)) {
    event = configuredOpenEvent;
    const { data: openEventApplication } = await supabase
      .from("applications")
      .select("id, status, booth_id, event_id")
      .eq("event_id", event.id)
      .eq("business_id", business.id)
      .maybeSingle();
    application = openEventApplication;
  }

  if (!event) {
    return (
      <div className="page-enter space-y-6">
        <h1 className="font-display text-h1 text-ink-950">Select your booth</h1>
        <Alert variant="info">Booth selection is not currently available.</Alert>
      </div>
    );
  }

  if (!application || !["approved", "booth_selected", "awaiting_payment"].includes(application.status)) {
    return (
      <div className="page-enter space-y-6">
        <h1 className="font-display text-h1 text-ink-950">Select your booth</h1>
        <Alert variant="info">
          {!application
            ? "Apply to this event from your dashboard first."
            : `Your application is ${APPLICATION_STATUS_LABELS[application.status]?.toLowerCase() ?? application.status}. Booth selection opens once it's approved.`}
        </Alert>
        <Link
          href="/vendor"
          className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-700"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  await supabase.rpc("release_expired_booth_locks", { p_event_id: event.id });
  await supabase.rpc("release_expired_invitations", { p_event_id: event.id });

  const [{ data: booths }, { data: zones }, { data: mapFeatures }, rule, { data: waitingListEntry }] = await Promise.all([
    supabase.from("booths").select("*").eq("event_id", event.id).order("booth_number"),
    supabase.from("zones").select("*").eq("event_id", event.id),
    supabase.from("map_features").select("*").eq("event_id", event.id),
    business.category_id
      ? supabase
          .from("category_zone_rules")
          .select("*")
          .eq("event_id", event.id)
          .eq("category_id", business.category_id)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
    supabase.from("waiting_list").select("*").eq("event_id", event.id).eq("business_id", business.id).maybeSingle(),
  ]);

  // Which categories currently occupy which booths (for "avoid adjacent same category").
  const { data: occupiedApplications } = await supabase
    .from("applications")
    .select("booth_id, businesses(category_id)")
    .eq("event_id", event.id)
    .not("booth_id", "is", null)
    .in("status", ["booth_selected", "awaiting_payment", "confirmed"]);

  const occupantCategoryByBoothId = new Map<string, string | null>();
  for (const app of occupiedApplications ?? []) {
    const b = app.businesses as unknown as { category_id: string | null } | null;
    if (app.booth_id) occupantCategoryByBoothId.set(app.booth_id, b?.category_id ?? null);
  }

  const allBooths = booths ?? [];
  const boothsWithRecommendations: BoothWithRecommendation[] = allBooths.map((booth) => {
    const nearby = getNearbyOccupants(booth, allBooths, occupantCategoryByBoothId);
    const recommendation = getBoothRecommendation(
      booth,
      business.category_id,
      rule ?? null,
      nearby,
      event.recommendations_enabled
    );
    return { ...booth, ...recommendation };
  });

  const invitedBooth = waitingListEntry?.invited_booth_id
    ? allBooths.find((b) => b.id === waitingListEntry.invited_booth_id)
    : null;

  return (
    <div className="page-enter space-y-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-caption font-medium text-ink-400">
          <Link
            href="/vendor"
            className="rounded-sm transition-colors hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            Dashboard
          </Link>
          <span aria-hidden="true" className="mx-1.5">/</span>
          <span className="text-ink-500">{event.name}</span>
        </nav>
        <h1 className="mt-2 font-display text-h1 text-ink-950">Select your booth</h1>
        <p className="mt-2 text-sm text-ink-500">Tap a booth to see details. Zoom and pan to explore the floor plan.</p>
      </div>

      {!application.booth_id && (
        <WaitingListPanel
          eventId={event.id}
          entry={waitingListEntry ?? null}
          zones={zones ?? []}
          boothLockMinutes={event.booth_lock_minutes}
          invitedBoothNumber={invitedBooth?.booth_number ?? null}
        />
      )}

      <Card>
        <CardContent className="p-4 sm:p-6">
          <FloorPlan
            eventId={event.id}
            businessId={business.id}
            boothLockMinutes={event.booth_lock_minutes}
            initialBooths={boothsWithRecommendations}
            zones={zones ?? []}
            mapFeatures={mapFeatures ?? []}
            myBoothId={application.booth_id}
            applicationStatus={application.status}
          />
        </CardContent>
      </Card>
    </div>
  );
}
