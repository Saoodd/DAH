"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { boothFormSchema, zoneFormSchema, mapFeatureFormSchema } from "@/lib/validations/booth";
import type { ActionResult } from "@/app/auth/actions";
import type { BoothStatus, Database } from "@/types/database";

type BoothUpdate = Database["public"]["Tables"]["booths"]["Update"];
type BoothInsert = Database["public"]["Tables"]["booths"]["Insert"];

function fail(error: string): ActionResult {
  return { ok: false, error };
}

async function nextBoothNumber(supabase: Awaited<ReturnType<typeof createClient>>, eventId: string) {
  const { count } = await supabase
    .from("booths")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);
  return `B${String((count ?? 0) + 1).padStart(3, "0")}`;
}

export async function createBoothAction(eventId: string): Promise<ActionResult & { id?: string }> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const boothNumber = await nextBoothNumber(supabase, eventId);
  const insert: BoothInsert = {
    event_id: eventId,
    booth_number: boothNumber,
    map_x: 5,
    map_y: 5,
    map_width: 8,
    map_height: 8,
    price_before_vat: 500,
    status: "available",
  };

  const { data, error } = await supabase.from("booths").insert(insert).select("id").single();
  if (error || !data) return fail("Could not create booth. Booth numbers must be unique per event.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "booth.created",
    entityType: "booth",
    entityId: data.id,
    newValue: { booth_number: boothNumber },
  });

  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true, id: data.id };
}

export async function updateBoothPositionAction(
  boothId: string,
  eventId: string,
  position: { mapX: number; mapY: number; mapWidth?: number; mapHeight?: number; rotation?: number }
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const updates: BoothUpdate = { map_x: position.mapX, map_y: position.mapY };
  if (position.mapWidth !== undefined) updates.map_width = position.mapWidth;
  if (position.mapHeight !== undefined) updates.map_height = position.mapHeight;
  if (position.rotation !== undefined) updates.rotation = position.rotation;

  const { error } = await supabase.from("booths").update(updates).eq("id", boothId);
  if (error) return fail("Could not move the booth.");

  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true };
}

export async function updateBoothDetailsAction(
  boothId: string,
  eventId: string,
  formData: FormData
): Promise<ActionResult> {
  const { authUser } = await requireAdmin();

  const parsed = boothFormSchema.safeParse({
    boothNumber: String(formData.get("boothNumber") ?? ""),
    sizeLabel: String(formData.get("sizeLabel") ?? ""),
    priceBeforeVat: Number(formData.get("priceBeforeVat") ?? 0),
    zoneId: String(formData.get("zoneId") ?? ""),
    featureTags: formData.getAll("featureTags").map(String),
    suitableCategoryIds: formData.getAll("suitableCategoryIds").map(String),
    distanceFromEntrance: formData.get("distanceFromEntrance") ? Number(formData.get("distanceFromEntrance")) : null,
    adminNotes: String(formData.get("adminNotes") ?? ""),
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.");
  const data = parsed.data;

  const supabase = await createClient();
  const { data: existing } = await supabase.from("booths").select("*").eq("id", boothId).maybeSingle();
  if (!existing) return fail("Booth not found.");

  const updates: BoothUpdate = {
    booth_number: data.boothNumber,
    size_label: data.sizeLabel || null,
    price_before_vat: data.priceBeforeVat,
    zone_id: data.zoneId || null,
    feature_tags: data.featureTags,
    suitable_category_ids: data.suitableCategoryIds,
    distance_from_entrance: data.distanceFromEntrance,
    admin_notes: data.adminNotes || null,
  };

  const { error } = await supabase.from("booths").update(updates).eq("id", boothId);
  if (error) {
    if (error.code === "23505") return fail("That booth number is already used in this event.");
    return fail("Could not save the booth.");
  }

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "booth.updated",
    entityType: "booth",
    entityId: boothId,
    previousValue: { booth_number: existing.booth_number, price_before_vat: existing.price_before_vat },
    newValue: { booth_number: data.boothNumber, price_before_vat: data.priceBeforeVat },
  });

  await supabase.from("booth_events").insert({
    booth_id: boothId,
    event_type: "note_added",
    actor_id: authUser.id,
    details: { action: "details_updated" },
  });

  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true };
}

export async function duplicateBoothAction(boothId: string, eventId: string): Promise<ActionResult & { id?: string }> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: source } = await supabase.from("booths").select("*").eq("id", boothId).maybeSingle();
  if (!source) return fail("Booth not found.");

  const boothNumber = await nextBoothNumber(supabase, eventId);
  const insert: BoothInsert = {
    event_id: eventId,
    zone_id: source.zone_id,
    booth_number: boothNumber,
    size_label: source.size_label,
    map_x: Math.min(90, source.map_x + 3),
    map_y: Math.min(90, source.map_y + 3),
    map_width: source.map_width,
    map_height: source.map_height,
    price_before_vat: source.price_before_vat,
    feature_tags: source.feature_tags,
    suitable_category_ids: source.suitable_category_ids,
    status: "available",
  };

  const { data, error } = await supabase.from("booths").insert(insert).select("id").single();
  if (error || !data) return fail("Could not duplicate the booth.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "booth.duplicated",
    entityType: "booth",
    entityId: data.id,
    metadata: { duplicated_from: boothId },
  });

  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true, id: data.id };
}

export async function deleteBoothAction(boothId: string, eventId: string): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("booths").delete().eq("id", boothId);
  if (error) return fail("Could not delete this booth — it may already have an application linked to it.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "booth.deleted",
    entityType: "booth",
    entityId: boothId,
  });

  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true };
}

const ADMIN_SETTABLE_STATUSES: BoothStatus[] = ["available", "blocked", "unavailable"];

export async function setBoothStatusAction(
  boothId: string,
  eventId: string,
  status: BoothStatus
): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  if (!ADMIN_SETTABLE_STATUSES.includes(status)) {
    return fail("Use the dedicated hold/reserve/confirm/release actions for that status.");
  }
  const supabase = await createClient();

  const { data: existing } = await supabase.from("booths").select("status").eq("id", boothId).maybeSingle();
  if (!existing) return fail("Booth not found.");

  const { error } = await supabase
    .from("booths")
    .update({
      status,
      held_for_business_id: null,
      locked_by_business_id: null,
      lock_expires_at: null,
      current_application_id: null,
    })
    .eq("id", boothId);
  if (error) return fail("Could not update booth status.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: `booth.${status}`,
    entityType: "booth",
    entityId: boothId,
    previousValue: { status: existing.status },
    newValue: { status },
  });
  await supabase
    .from("booth_events")
    .insert({ booth_id: boothId, event_type: status === "blocked" ? "blocked" : status === "available" ? "unblocked" : "status_changed", actor_id: authUser.id });

  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true };
}

export async function adminHoldBoothAction(boothId: string, eventId: string, businessId: string): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("booths")
    .update({ status: "admin_held", held_for_business_id: businessId })
    .eq("id", boothId);
  if (error) return fail("Could not hold this booth.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "booth.admin_held",
    entityType: "booth",
    entityId: boothId,
    newValue: { held_for_business_id: businessId },
  });
  await supabase
    .from("booth_events")
    .insert({ booth_id: boothId, event_type: "admin_held", business_id: businessId, actor_id: authUser.id });

  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true };
}

export async function adminReleaseBoothAction(boothId: string, eventId: string, reason?: string): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("booths")
    .select("status, current_application_id")
    .eq("id", boothId)
    .maybeSingle();
  if (!existing) return fail("Booth not found.");

  const { error } = await supabase
    .from("booths")
    .update({
      status: "available",
      held_for_business_id: null,
      locked_by_business_id: null,
      lock_expires_at: null,
      current_application_id: null,
    })
    .eq("id", boothId);
  if (error) return fail("Could not release this booth.");

  if (existing.current_application_id) {
    await supabase
      .from("applications")
      .update({ booth_id: null, booth_price_before_vat: null, vat_amount: null, total_amount: null, status: "approved" })
      .eq("id", existing.current_application_id);
  }

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "booth.admin_released",
    entityType: "booth",
    entityId: boothId,
    previousValue: { status: existing.status },
    newValue: { status: "available", reason: reason ?? null },
  });
  await supabase
    .from("booth_events")
    .insert({ booth_id: boothId, event_type: "admin_released", actor_id: authUser.id, details: { reason: reason ?? null } });

  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true };
}

export async function adminAssignBoothAction(
  boothId: string,
  eventId: string,
  applicationId: string,
  status: "reserved" | "confirmed"
): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: application } = await supabase
    .from("applications")
    .select("id, business_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!application) return fail("Application not found.");

  const { data: booth } = await supabase.from("booths").select("price_before_vat").eq("id", boothId).maybeSingle();
  if (!booth) return fail("Booth not found.");

  const vat = Math.round(booth.price_before_vat * 0.05 * 100) / 100;

  const { error: boothError } = await supabase
    .from("booths")
    .update({ status, current_application_id: applicationId, locked_by_business_id: application.business_id, lock_expires_at: null })
    .eq("id", boothId);
  if (boothError) return fail("Could not assign this booth.");

  await supabase
    .from("applications")
    .update({
      booth_id: boothId,
      booth_price_before_vat: booth.price_before_vat,
      vat_amount: vat,
      total_amount: booth.price_before_vat + vat,
      status: status === "confirmed" ? "confirmed" : "booth_selected",
    })
    .eq("id", applicationId);

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: `booth.${status}`,
    entityType: "booth",
    entityId: boothId,
    newValue: { application_id: applicationId, status },
  });
  await supabase
    .from("booth_events")
    .insert({ booth_id: boothId, event_type: status, business_id: application.business_id, actor_id: authUser.id });

  revalidatePath(`/admin/events/${eventId}/booths`);
  revalidatePath(`/admin/events/${eventId}/applications`);
  return { ok: true };
}

export async function adminExtendLockAction(boothId: string, eventId: string, extraMinutes: number): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: booth } = await supabase.from("booths").select("status, lock_expires_at").eq("id", boothId).maybeSingle();
  if (!booth || booth.status !== "locked") return fail("This booth isn't currently locked.");

  const base = booth.lock_expires_at && new Date(booth.lock_expires_at) > new Date() ? new Date(booth.lock_expires_at) : new Date();
  const newExpiry = new Date(base.getTime() + extraMinutes * 60_000).toISOString();

  const { error } = await supabase.from("booths").update({ lock_expires_at: newExpiry }).eq("id", boothId);
  if (error) return fail("Could not extend the lock.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "booth.lock_extended",
    entityType: "booth",
    entityId: boothId,
    newValue: { lock_expires_at: newExpiry },
  });
  await supabase
    .from("booth_events")
    .insert({ booth_id: boothId, event_type: "lock_extended", actor_id: authUser.id, details: { extra_minutes: extraMinutes } });

  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true };
}

export async function adminSwapBoothsAction(
  applicationIdA: string,
  applicationIdB: string,
  eventId: string
): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: apps } = await supabase
    .from("applications")
    .select("id, booth_id, business_id")
    .in("id", [applicationIdA, applicationIdB]);

  const appA = apps?.find((a) => a.id === applicationIdA);
  const appB = apps?.find((a) => a.id === applicationIdB);
  if (!appA?.booth_id || !appB?.booth_id) return fail("Both applications must already have a booth assigned.");

  const { data: booths } = await supabase
    .from("booths")
    .select("id, price_before_vat")
    .in("id", [appA.booth_id, appB.booth_id]);
  const boothA = booths?.find((b) => b.id === appA.booth_id);
  const boothB = booths?.find((b) => b.id === appB.booth_id);
  if (!boothA || !boothB) return fail("Could not find both booths.");

  const vatA = Math.round(boothA.price_before_vat * 0.05 * 100) / 100;
  const vatB = Math.round(boothB.price_before_vat * 0.05 * 100) / 100;

  await supabase
    .from("booths")
    .update({ current_application_id: applicationIdB, locked_by_business_id: appB.business_id })
    .eq("id", boothA.id);
  await supabase
    .from("booths")
    .update({ current_application_id: applicationIdA, locked_by_business_id: appA.business_id })
    .eq("id", boothB.id);

  await supabase
    .from("applications")
    .update({ booth_id: boothB.id, booth_price_before_vat: boothB.price_before_vat, vat_amount: vatB, total_amount: boothB.price_before_vat + vatB })
    .eq("id", applicationIdA);
  await supabase
    .from("applications")
    .update({ booth_id: boothA.id, booth_price_before_vat: boothA.price_before_vat, vat_amount: vatA, total_amount: boothA.price_before_vat + vatA })
    .eq("id", applicationIdB);

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "booth.swapped",
    entityType: "application",
    entityId: applicationIdA,
    metadata: { swapped_with: applicationIdB },
  });
  await supabase.from("booth_events").insert([
    { booth_id: boothA.id, event_type: "swapped", actor_id: authUser.id, business_id: appB.business_id },
    { booth_id: boothB.id, event_type: "swapped", actor_id: authUser.id, business_id: appA.business_id },
  ]);

  revalidatePath(`/admin/events/${eventId}/booths`);
  revalidatePath(`/admin/events/${eventId}/applications`);
  return { ok: true };
}

export async function releaseExpiredLocksAction(eventId: string): Promise<ActionResult & { count?: number }> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("release_expired_booth_locks", { p_event_id: eventId });
  if (error) return fail("Could not release expired locks.");
  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true, count: data ?? 0 };
}

export async function createZoneAction(eventId: string, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = zoneFormSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    color: String(formData.get("color") ?? "#6B7280"),
    description: String(formData.get("description") ?? ""),
  });
  if (!parsed.success) return fail("Zone name is required.");

  const supabase = await createClient();
  const { error } = await supabase.from("zones").insert({
    event_id: eventId,
    name: parsed.data.name,
    color: parsed.data.color,
    description: parsed.data.description || null,
  });
  if (error) return fail("Could not create zone.");

  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true };
}

export async function deleteZoneAction(zoneId: string, eventId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("zones").delete().eq("id", zoneId);
  if (error) return fail("Could not delete zone.");
  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true };
}

export async function createMapFeatureAction(eventId: string, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = mapFeatureFormSchema.safeParse({
    type: String(formData.get("type") ?? "other"),
    label: String(formData.get("label") ?? ""),
  });
  if (!parsed.success) return fail("Please choose a valid feature type.");

  const supabase = await createClient();
  const { error } = await supabase.from("map_features").insert({
    event_id: eventId,
    type: parsed.data.type,
    label: parsed.data.label || null,
    map_x: 45,
    map_y: 2,
    map_width: 10,
    map_height: 5,
  });
  if (error) return fail("Could not create map feature.");

  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true };
}

export async function updateMapFeaturePositionAction(
  featureId: string,
  eventId: string,
  position: { mapX: number; mapY: number; mapWidth?: number; mapHeight?: number }
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const updates: Database["public"]["Tables"]["map_features"]["Update"] = { map_x: position.mapX, map_y: position.mapY };
  if (position.mapWidth !== undefined) updates.map_width = position.mapWidth;
  if (position.mapHeight !== undefined) updates.map_height = position.mapHeight;
  const { error } = await supabase.from("map_features").update(updates).eq("id", featureId);
  if (error) return fail("Could not move map feature.");
  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true };
}

export async function deleteMapFeatureAction(featureId: string, eventId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("map_features").delete().eq("id", featureId);
  if (error) return fail("Could not delete map feature.");
  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true };
}

export async function searchVendorsAction(query: string): Promise<{ id: string; business_name: string; email: string }[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("businesses")
    .select("id, business_name, email")
    .eq("approval_status", "approved")
    .ilike("business_name", `%${query}%`)
    .limit(10);
  return data ?? [];
}

export interface BoothHistoryEntry {
  id: string;
  event_type: string;
  created_at: string;
  details: unknown;
  actor_name: string | null;
  business_name: string | null;
}

export async function getBoothHistoryAction(boothId: string): Promise<BoothHistoryEntry[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("booth_events")
    .select("id, event_type, created_at, details, profiles(full_name), businesses(business_name)")
    .eq("booth_id", boothId)
    .order("created_at", { ascending: false })
    .limit(50);

  return (data ?? []).map((row) => {
    const actor = row.profiles as unknown as { full_name: string | null } | null;
    const business = row.businesses as unknown as { business_name: string } | null;
    return {
      id: row.id,
      event_type: row.event_type,
      created_at: row.created_at,
      details: row.details,
      actor_name: actor?.full_name ?? null,
      business_name: business?.business_name ?? null,
    };
  });
}

export async function findApplicationForBusinessAction(eventId: string, businessId: string): Promise<string | null> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("applications")
    .select("id")
    .eq("event_id", eventId)
    .eq("business_id", businessId)
    .maybeSingle();
  return data?.id ?? null;
}
