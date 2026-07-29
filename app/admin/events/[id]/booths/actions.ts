"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { sendNotification } from "@/lib/notifications";
import { boothFormSchema, zoneFormSchema, mapFeatureFormSchema } from "@/lib/validations/booth";
import type { ActionResult } from "@/app/auth/actions";
import type { BoothStatus, Database } from "@/types/database";

type BoothUpdate = Database["public"]["Tables"]["booths"]["Update"];
type BoothInsert = Database["public"]["Tables"]["booths"]["Insert"];

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function validMapNumber(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validMapPosition(position: {
  mapX: number;
  mapY: number;
  mapWidth?: number;
  mapHeight?: number;
  rotation?: number;
}): boolean {
  return (
    validMapNumber(position.mapX, 0, 100) &&
    validMapNumber(position.mapY, 0, 100) &&
    (position.mapWidth === undefined || validMapNumber(position.mapWidth, 0.5, 100)) &&
    (position.mapHeight === undefined || validMapNumber(position.mapHeight, 0.5, 100)) &&
    (position.rotation === undefined || validMapNumber(position.rotation, -360, 360))
  );
}

function boothMutationError(error: { message: string } | null, fallback: string): ActionResult {
  const message = error?.message ?? "";
  if (message.includes("BOOTH_NOT_FOUND")) return fail("Booth not found in this event.");
  if (message.includes("APPLICATION_NOT_FOUND")) return fail("Application not found.");
  if (message.includes("BOOTH_EVENT_MISMATCH")) {
    return fail("The booth and application no longer belong to the selected event. Refresh and try again.");
  }
  if (message.includes("BUSINESS_NOT_APPROVED") || message.includes("BUSINESS_REAPPROVAL_REQUIRED")) {
    return fail("This vendor is not currently eligible for booth assignment.");
  }
  if (message.includes("APPLICATION_NOT_ELIGIBLE") || message.includes("ACTIVE_BOOTH_EXISTS")) {
    return fail("Release the application's current booth before assigning another one.");
  }
  if (message.includes("BOOTH_UNAVAILABLE")) {
    return fail("This booth is no longer available for that vendor. Refresh and try again.");
  }
  if (message.includes("BOOTH_PAYMENT_CONFLICT")) {
    return fail("This booth has a paid or partially refunded payment. Complete the refund before releasing it.");
  }
  if (message.includes("BOOTH_STATE_CONFLICT") || message.includes("BOOTH_ASSIGNMENT_INVALID")) {
    return fail("The booth assignment changed or is inconsistent. Refresh before trying again.");
  }
  if (message.includes("BOOTH_NOT_RELEASABLE")) return fail("This booth has no active hold or assignment to release.");
  if (message.includes("INVALID_RELEASE_REASON")) return fail("Keep the release reason under 2,000 characters.");
  if (message.includes("EVENT_NOT_ACTIVE")) return fail("This event has ended or is archived.");
  return fail(fallback);
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
  if (!validMapPosition(position)) return fail("Booth position or size is outside the map bounds.");
  await requireAdmin();
  const supabase = await createClient();

  const updates: BoothUpdate = { map_x: position.mapX, map_y: position.mapY };
  if (position.mapWidth !== undefined) updates.map_width = position.mapWidth;
  if (position.mapHeight !== undefined) updates.map_height = position.mapHeight;
  if (position.rotation !== undefined) updates.rotation = position.rotation;

  const { data: updated, error } = await supabase
    .from("booths")
    .update(updates)
    .eq("id", boothId)
    .eq("event_id", eventId)
    .select("id")
    .maybeSingle();
  if (error) return fail("Could not move the booth.");
  if (!updated) return fail("Booth not found in this event.");

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
  const { data: existing, error: existingError } = await supabase.from("booths").select("*").eq("id", boothId).maybeSingle();
  if (existingError) return fail("Could not load the booth.");
  if (!existing || existing.event_id !== eventId) return fail("Booth not found in this event.");

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

  const { error } = await supabase.from("booths").update(updates).eq("id", boothId).eq("event_id", eventId);
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

  const { data: source, error: sourceError } = await supabase.from("booths").select("*").eq("id", boothId).maybeSingle();
  if (sourceError) return fail("Could not load the booth.");
  if (!source || source.event_id !== eventId) return fail("Booth not found in this event.");

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

  const { data: booth, error: fetchError } = await supabase
    .from("booths")
    .select("event_id, status, current_application_id")
    .eq("id", boothId)
    .maybeSingle();
  if (fetchError) return fail("Could not load this booth.");
  if (!booth || booth.event_id !== eventId) return fail("Booth not found in this event.");
  if (
    booth.current_application_id ||
    !["available", "blocked", "unavailable"].includes(booth.status)
  ) {
    return fail("Release this booth and its linked application before deleting it.");
  }

  const { error } = await supabase
    .from("booths")
    .delete()
    .eq("id", boothId)
    .eq("event_id", eventId)
    .is("current_application_id", null);
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

  const { data: existing, error: fetchError } = await supabase
    .from("booths")
    .select("event_id, status, current_application_id")
    .eq("id", boothId)
    .maybeSingle();
  if (fetchError) return fail("Could not load this booth.");
  if (!existing || existing.event_id !== eventId) return fail("Booth not found in this event.");
  if (
    existing.current_application_id ||
    !ADMIN_SETTABLE_STATUSES.includes(existing.status)
  ) {
    return fail("Release the booth's current hold or assignment before changing its status.");
  }

  const { data: updated, error } = await supabase
    .from("booths")
    .update({
      status,
      held_for_business_id: null,
      locked_by_business_id: null,
      lock_expires_at: null,
      current_application_id: null,
    })
    .eq("id", boothId)
    .eq("event_id", eventId)
    .eq("status", existing.status)
    .is("current_application_id", null)
    .select("id")
    .maybeSingle();
  if (error) return fail("Could not update booth status.");
  if (!updated) return fail("The booth changed. Refresh the map and try again.");

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

  const [{ data: booth, error: boothFetchError }, { data: business, error: businessError }] =
    await Promise.all([
      supabase
        .from("booths")
        .select("event_id, status, current_application_id")
        .eq("id", boothId)
        .maybeSingle(),
      supabase
        .from("businesses")
        .select("approval_status, requires_reapproval")
        .eq("id", businessId)
        .maybeSingle(),
    ]);
  if (boothFetchError || businessError) return fail("Could not validate this hold.");
  if (!booth || booth.event_id !== eventId) return fail("Booth not found in this event.");
  if (booth.status !== "available" || booth.current_application_id) {
    return fail("Only an available, unassigned booth can be placed on hold.");
  }
  if (!business || business.approval_status !== "approved" || business.requires_reapproval) {
    return fail("Only an approved vendor with no pending re-review can receive a hold.");
  }

  const { data: updated, error } = await supabase
    .from("booths")
    .update({
      status: "admin_held",
      held_for_business_id: businessId,
      locked_by_business_id: null,
      lock_expires_at: null,
    })
    .eq("id", boothId)
    .eq("event_id", eventId)
    .eq("status", "available")
    .is("current_application_id", null)
    .select("id")
    .maybeSingle();
  if (error) return fail("Could not hold this booth.");
  if (!updated) return fail("The booth was assigned while you were working. Refresh and try again.");

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
  const normalizedReason = reason?.trim() || null;
  if (normalizedReason && normalizedReason.length > 2000) {
    return fail("Keep the release reason under 2,000 characters.");
  }
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: result, error } = await supabase.rpc("admin_release_booth", {
    p_booth_id: boothId,
    p_event_id: eventId,
    p_reason: normalizedReason,
  });
  if (error || !result) return boothMutationError(error, "Could not release this booth.");

  if (result.application_id && result.business_id) {
    await sendNotification(supabase, {
      businessId: result.business_id,
      templateKey: "booth_released",
      variables: { booth_number: result.booth_number },
    });
  }

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "booth.admin_released",
    entityType: "booth",
    entityId: boothId,
    previousValue: { status: result.previous_status, application_status: result.previous_application_status ?? null },
    newValue: { status: result.status, application_status: result.application_status, reason: normalizedReason },
    metadata: { application_id: result.application_id, payment_id: result.payment_id, payment_status: result.payment_status },
  });

  revalidatePath(`/admin/events/${eventId}/booths`);
  revalidatePath(`/admin/events/${eventId}/applications`);
  revalidatePath(`/admin/events/${eventId}/payments`);
  return { ok: true };
}

export async function adminAssignBoothAction(
  boothId: string,
  eventId: string,
  applicationId: string
): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: result, error } = await supabase.rpc("admin_assign_booth", {
    p_booth_id: boothId,
    p_event_id: eventId,
    p_application_id: applicationId,
  });
  if (error || !result) return boothMutationError(error, "Could not assign this booth.");

  if (result.changed) {
    await logAudit(supabase, {
      actorId: authUser.id,
      actorRole: "admin",
      action: "booth.reserved",
      entityType: "booth",
      entityId: boothId,
      previousValue: { status: result.previous_status },
      newValue: { application_id: result.application_id, status: result.status, application_status: result.application_status },
    });
  }

  revalidatePath(`/admin/events/${eventId}/booths`);
  revalidatePath(`/admin/events/${eventId}/applications`);
  return { ok: true };
}

export async function adminExtendLockAction(boothId: string, eventId: string, extraMinutes: number): Promise<ActionResult> {
  if (!Number.isInteger(extraMinutes) || extraMinutes < 1 || extraMinutes > 120) {
    return fail("Enter a whole number of minutes between 1 and 120.");
  }
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: booth } = await supabase.from("booths").select("event_id, status, lock_expires_at").eq("id", boothId).maybeSingle();
  if (!booth || booth.status !== "locked") return fail("This booth isn't currently locked.");
  if (booth.event_id !== eventId) return fail("Booth not found in this event.");

  const base = booth.lock_expires_at && new Date(booth.lock_expires_at) > new Date() ? new Date(booth.lock_expires_at) : new Date();
  const newExpiry = new Date(base.getTime() + extraMinutes * 60_000).toISOString();

  const { error } = await supabase
    .from("booths")
    .update({ lock_expires_at: newExpiry })
    .eq("id", boothId)
    .eq("status", "locked");
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
  const { error } = await supabase.from("zones").delete().eq("id", zoneId).eq("event_id", eventId);
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
  if (!validMapPosition(position)) return fail("Feature position or size is outside the map bounds.");
  await requireAdmin();
  const supabase = await createClient();
  const updates: Database["public"]["Tables"]["map_features"]["Update"] = { map_x: position.mapX, map_y: position.mapY };
  if (position.mapWidth !== undefined) updates.map_width = position.mapWidth;
  if (position.mapHeight !== undefined) updates.map_height = position.mapHeight;
  const { data: updated, error } = await supabase
    .from("map_features")
    .update(updates)
    .eq("id", featureId)
    .eq("event_id", eventId)
    .select("id")
    .maybeSingle();
  if (error) return fail("Could not move map feature.");
  if (!updated) return fail("Map feature not found in this event.");
  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true };
}

export async function deleteMapFeatureAction(featureId: string, eventId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("map_features").delete().eq("id", featureId).eq("event_id", eventId);
  if (error) return fail("Could not delete map feature.");
  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true };
}

export async function searchVendorsAction(query: string): Promise<{ id: string; business_name: string; email: string }[]> {
  await requireAdmin();
  const normalized = query.trim().slice(0, 100).replace(/[%_]/g, " ");
  if (normalized.length < 2) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("id, business_name, email")
    .eq("approval_status", "approved")
    .ilike("business_name", `%${normalized}%`)
    .limit(10);
  if (error) return [];
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
  const { data, error } = await supabase
    .from("applications")
    .select("id")
    .eq("event_id", eventId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) return null;
  return data?.id ?? null;
}
