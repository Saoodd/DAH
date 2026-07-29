"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";
import { FEATURE_TAG_OPTIONS } from "@/lib/validations/booth";
import type { ActionResult } from "@/app/auth/actions";

function fail(error: string): ActionResult {
  return { ok: false, error };
}

export async function upsertCategoryRuleAction(eventId: string, categoryId: string, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const preferredZoneId = String(formData.get("preferredZoneId") ?? "");
  const preferredFeatureTags = Array.from(new Set(formData.getAll("preferredFeatureTags").map(String)));
  const avoidAdjacent = formData.get("avoidAdjacent") === "on";
  const maxPerZoneRaw = String(formData.get("maxPerZone") ?? "");
  const maxPerZone = maxPerZoneRaw ? Number(maxPerZoneRaw) : null;

  if (!preferredFeatureTags.every((tag) => FEATURE_TAG_OPTIONS.includes(tag as (typeof FEATURE_TAG_OPTIONS)[number]))) {
    return fail("Choose only supported booth features.");
  }
  if (maxPerZone !== null && (!Number.isInteger(maxPerZone) || maxPerZone < 1 || maxPerZone > 10_000)) {
    return fail("Max booths per zone must be a whole number between 1 and 10,000.");
  }

  const [{ data: event, error: eventError }, { data: category, error: categoryError }] = await Promise.all([
    supabase.from("events").select("id").eq("id", eventId).maybeSingle(),
    supabase.from("categories").select("id").eq("id", categoryId).maybeSingle(),
  ]);
  if (eventError || categoryError) return fail("Could not validate this recommendation rule.");
  if (!event || !category) return fail("The event or category no longer exists.");

  if (preferredZoneId) {
    const { data: zone, error: zoneError } = await supabase
      .from("zones")
      .select("id")
      .eq("id", preferredZoneId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (zoneError) return fail("Could not validate the preferred zone.");
    if (!zone) return fail("Choose a zone from this event.");
  }


  const { error } = await supabase.from("category_zone_rules").upsert(
    {
      event_id: eventId,
      category_id: categoryId,
      preferred_zone_id: preferredZoneId || null,
      preferred_feature_tags: preferredFeatureTags,
      avoid_adjacent_same_category: avoidAdjacent,
      max_per_zone: maxPerZone,
    },
    { onConflict: "event_id,category_id" }
  );

  if (error) return fail("Could not save this rule.");

  revalidatePath(`/admin/events/${eventId}/recommendations`);
  return { ok: true };
}

export async function deleteCategoryRuleAction(ruleId: string, eventId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: deleted, error } = await supabase
    .from("category_zone_rules")
    .delete()
    .eq("id", ruleId)
    .eq("event_id", eventId)
    .select("id")
    .maybeSingle();
  if (error) return fail("Could not remove this rule.");
  revalidatePath(`/admin/events/${eventId}/recommendations`);
  if (!deleted) return fail("This rule no longer exists. Refresh and try again.");
  return { ok: true };
}
