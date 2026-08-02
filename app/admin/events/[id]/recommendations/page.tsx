import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CategoryRuleRow } from "@/components/admin/category-rule-row";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";

export const metadata: Metadata = { title: "Booth Recommendations" };

export default async function AdminRecommendationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, name, recommendations_enabled")
    .eq("id", id)
    .maybeSingle();
  if (eventError) throw new Error("Could not load the recommendation workspace.");
  if (!event) notFound();

  const [categoriesResult, zonesResult, rulesResult] = await Promise.all([
    supabase.from("categories").select("id, name").order("sort_order"),
    supabase.from("zones").select("*").eq("event_id", id).order("name"),
    supabase.from("category_zone_rules").select("*").eq("event_id", id),
  ]);
  if (categoriesResult.error || zonesResult.error || rulesResult.error) {
    throw new Error("Could not load recommendation rules.");
  }
  const categories = categoriesResult.data;
  const zones = zonesResult.data;
  const rules = rulesResult.data;

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
        <h1 className="mt-3 font-display text-h2 text-ink-950 sm:text-h1">Booth recommendations</h1>
        <p className="mt-2 text-sm text-ink-500">
          Rule-based only — configure which booths get recommended to each vendor category.
        </p>
      </div>

      {!event.recommendations_enabled && (
        <Alert variant="warning">
          Recommendations are disabled for this event. Enable them from the event&rsquo;s details page.
        </Alert>
      )}

      {!zones?.length && <Alert variant="info">Add zones on the booth map before configuring zone preferences.</Alert>}

      {!categories?.length ? (
        <EmptyState
          icon={<Icon name="map-pin" size="lg" />}
          title="No vendor categories yet"
          description="Recommendation rules are configured per category — add categories first."
        />
      ) : (
        <div className="stagger-children grid gap-4 sm:grid-cols-2">
          {categories.map((category) => (
            <CategoryRuleRow
              key={category.id}
              eventId={id}
              category={category}
              zones={zones ?? []}
              rule={rules?.find((r) => r.category_id === category.id) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
