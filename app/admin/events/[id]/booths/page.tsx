import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { BoothMapEditor } from "@/components/admin/booth-map-editor";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Booth Map" };

export default async function AdminBoothMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (eventError) throw new Error("Could not load the booth-map workspace.");
  if (!event) notFound();

  const { error: sweepError } = await supabase.rpc("release_expired_booth_locks", { p_event_id: id });
  if (sweepError) throw new Error("Could not refresh expired booth holds.");

  const [boothsResult, zonesResult, featuresResult, categoriesResult] = await Promise.all([
    supabase.from("booths").select("*").eq("event_id", id).order("booth_number"),
    supabase.from("zones").select("*").eq("event_id", id).order("name"),
    supabase.from("map_features").select("*").eq("event_id", id),
    supabase.from("categories").select("id, name").order("sort_order"),
  ]);
  const loadError = boothsResult.error || zonesResult.error || featuresResult.error || categoriesResult.error;

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
          <Link
            href={`/admin/events/${event.id}/edit`}
            className="transition-colors hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            {event.name}
          </Link>
          <span aria-hidden="true"> / </span>
          <span className="text-ink-600">Booth map</span>
        </nav>
        <h1 className="mt-3 font-display text-h2 text-ink-950 sm:text-h1">Booth map</h1>
        <p className="mt-2 text-sm text-ink-500">Drag booths to move them, or drag the corner handle to resize.</p>
      </div>

      {loadError ? (
        <Alert variant="error" title="Could not load the booth map">
          Refresh the page to try again. No changes were made.
        </Alert>
      ) : (
        <BoothMapEditor
          eventId={id}
          initialBooths={boothsResult.data ?? []}
          zones={zonesResult.data ?? []}
          mapFeatures={featuresResult.data ?? []}
          categories={categoriesResult.data ?? []}
        />
      )}
    </div>
  );
}
