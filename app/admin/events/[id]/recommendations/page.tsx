import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CategoryRuleRow } from "@/components/admin/category-rule-row";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Booth Recommendations" };

export default async function AdminRecommendationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name, recommendations_enabled")
    .eq("id", id)
    .maybeSingle();
  if (!event) notFound();

  const [{ data: categories }, { data: zones }, { data: rules }] = await Promise.all([
    supabase.from("categories").select("id, name").order("sort_order"),
    supabase.from("zones").select("*").eq("event_id", id).order("name"),
    supabase.from("category_zone_rules").select("*").eq("event_id", id),
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
        <h1 className="text-2xl font-semibold text-ink-950">Booth recommendations</h1>
        <p className="mt-1 text-sm text-ink-500">
          Rule-based only — configure what booths get recommended to each category.
        </p>
      </div>

      {!event.recommendations_enabled && (
        <Alert variant="warning">
          Recommendations are disabled for this event. Enable them from the event&rsquo;s details page.
        </Alert>
      )}

      {!zones?.length && <Alert variant="info">Add zones on the booth map before configuring zone preferences.</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        {(categories ?? []).map((category) => (
          <CategoryRuleRow
            key={category.id}
            eventId={id}
            category={category}
            zones={zones ?? []}
            rule={rules?.find((r) => r.category_id === category.id) ?? null}
          />
        ))}
      </div>
    </div>
  );
}
