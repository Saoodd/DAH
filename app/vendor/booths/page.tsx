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

export const metadata: Metadata = { title: "Select Your Booth" };
export const dynamic = "force-dynamic";

export default async function VendorBoothsPage() {
  const business = await requireOwnedBusiness();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name, booth_lock_minutes, recommendations_enabled")
    .eq("registration_status", "open")
    .maybeSingle();

  if (!event) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-ink-950">Select your booth</h1>
        <Alert variant="info">There is no open event right now.</Alert>
      </div>
    );
  }

  const { data: application } = await supabase
    .from("applications")
    .select("id, status, booth_id")
    .eq("event_id", event.id)
    .eq("business_id", business.id)
    .maybeSingle();

  if (!application || !["approved", "booth_selected", "awaiting_payment"].includes(application.status)) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-ink-950">Select your booth</h1>
        <Alert variant="info">
          {!application
            ? "Apply to the open event from your dashboard first."
            : `Your application is ${APPLICATION_STATUS_LABELS[application.status]?.toLowerCase() ?? application.status}. Booth selection opens once it's approved.`}
        </Alert>
        <Link href="/vendor" className="text-sm font-medium text-brand-600 hover:text-brand-700">
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
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-400">
          <Link href="/vendor" className="hover:text-brand-600">
            Dashboard
          </Link>{" "}
          / {event.name}
        </p>
        <h1 className="text-2xl font-semibold text-ink-950">Select your booth</h1>
        <p className="mt-1 text-sm text-ink-500">Tap a booth to see details. Zoom and pan to explore the floor plan.</p>
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
