import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { BoothMapEditor } from "@/components/admin/booth-map-editor";

export const metadata: Metadata = { title: "Booth Map" };

export default async function AdminBoothMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase.from("events").select("id, name").eq("id", id).maybeSingle();
  if (!event) notFound();

  await supabase.rpc("release_expired_booth_locks", { p_event_id: id });

  const [{ data: booths }, { data: zones }, { data: mapFeatures }, { data: categories }] = await Promise.all([
    supabase.from("booths").select("*").eq("event_id", id).order("booth_number"),
    supabase.from("zones").select("*").eq("event_id", id).order("name"),
    supabase.from("map_features").select("*").eq("event_id", id),
    supabase.from("categories").select("id, name").order("sort_order"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-400">
          <Link href="/admin/events" className="hover:text-brand-600">
            Events
          </Link>{" "}
          / {event.name}
        </p>
        <h1 className="text-2xl font-semibold text-ink-950">Booth map</h1>
        <p className="mt-1 text-sm text-ink-500">Drag booths to move, drag the corner handle to resize.</p>
      </div>

      <BoothMapEditor
        eventId={id}
        initialBooths={booths ?? []}
        zones={zones ?? []}
        mapFeatures={mapFeatures ?? []}
        categories={categories ?? []}
      />
    </div>
  );
}
