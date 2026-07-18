"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";
import type { ActionResult } from "@/app/auth/actions";

function fail(error: string): ActionResult {
  return { ok: false, error };
}

export async function upsertCategoryRuleAction(eventId: string, categoryId: string, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const preferredZoneId = String(formData.get("preferredZoneId") ?? "");
  const preferredFeatureTags = formData.getAll("preferredFeatureTags").map(String);
  const avoidAdjacent = formData.get("avoidAdjacent") === "on";
  const maxPerZoneRaw = String(formData.get("maxPerZone") ?? "");

  const { error } = await supabase.from("category_zone_rules").upsert(
    {
      event_id: eventId,
      category_id: categoryId,
      preferred_zone_id: preferredZoneId || null,
      preferred_feature_tags: preferredFeatureTags,
      avoid_adjacent_same_category: avoidAdjacent,
      max_per_zone: maxPerZoneRaw ? Number(maxPerZoneRaw) : null,
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
  const { error } = await supabase.from("category_zone_rules").delete().eq("id", ruleId);
  if (error) return fail("Could not remove this rule.");
  revalidatePath(`/admin/events/${eventId}/recommendations`);
  return { ok: true };
}
