"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { uploadOwnedFile } from "@/lib/storage";
import { eventFormSchema, slugify } from "@/lib/validations/event";
import type { ActionResult } from "@/app/auth/actions";
import type { Database } from "@/types/database";

type EventInsert = Database["public"]["Tables"]["events"]["Insert"];

function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult {
  return { ok: false, error, fieldErrors };
}

function parseEventForm(formData: FormData) {
  return eventFormSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    location: String(formData.get("location") ?? ""),
    description: String(formData.get("description") ?? ""),
    vendorRules: String(formData.get("vendorRules") ?? ""),
    setupInstructions: String(formData.get("setupInstructions") ?? ""),
    startAt: String(formData.get("startAt") ?? ""),
    endAt: String(formData.get("endAt") ?? ""),
    setupStartAt: String(formData.get("setupStartAt") ?? ""),
    setupEndAt: String(formData.get("setupEndAt") ?? ""),
    registrationOpensAt: String(formData.get("registrationOpensAt") ?? ""),
    registrationClosesAt: String(formData.get("registrationClosesAt") ?? ""),
    paymentDeadlineMinutes: formData.get("paymentDeadlineMinutes"),
    boothLockMinutes: formData.get("boothLockMinutes"),
    recommendationsEnabled: formData.get("recommendationsEnabled") === "on",
    boothChangesLocked: formData.get("boothChangesLocked") === "on",
  });
}

async function uniqueSlug(supabase: Awaited<ReturnType<typeof createClient>>, base: string, excludeId?: string) {
  let slug = base || "event";
  let suffix = 1;
  for (;;) {
    let query = supabase.from("events").select("id").eq("slug", slug);
    if (excludeId) query = query.neq("id", excludeId);
    const { data } = await query.maybeSingle();
    if (!data) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

export async function createEventAction(formData: FormData): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const parsed = parseEventForm(formData);
  if (!parsed.success) return fail("Please fix the highlighted fields.", parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const supabase = await createClient();
  const slug = await uniqueSlug(supabase, slugify(data.name));

  const insert: EventInsert = {
    name: data.name,
    slug,
    location: data.location || null,
    description: data.description || null,
    vendor_rules: data.vendorRules || null,
    setup_instructions: data.setupInstructions || null,
    start_at: new Date(data.startAt).toISOString(),
    end_at: new Date(data.endAt).toISOString(),
    setup_start_at: data.setupStartAt ? new Date(data.setupStartAt).toISOString() : null,
    setup_end_at: data.setupEndAt ? new Date(data.setupEndAt).toISOString() : null,
    registration_opens_at: data.registrationOpensAt ? new Date(data.registrationOpensAt).toISOString() : null,
    registration_closes_at: data.registrationClosesAt ? new Date(data.registrationClosesAt).toISOString() : null,
    payment_deadline_minutes: data.paymentDeadlineMinutes,
    booth_lock_minutes: data.boothLockMinutes,
    recommendations_enabled: data.recommendationsEnabled,
    booth_changes_locked: data.boothChangesLocked,
    registration_status: "draft",
    created_by: authUser.id,
  };

  const banner = formData.get("banner");
  if (banner instanceof File && banner.size > 0) {
    const path = await uploadOwnedFile(supabase, "event-banners", authUser.id, banner);
    insert.banner_url = supabase.storage.from("event-banners").getPublicUrl(path).data.publicUrl;
  }

  const { data: event, error } = await supabase.from("events").insert(insert).select("id").single();
  if (error || !event) return fail("Could not create the event. Please try again.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "event.created",
    entityType: "event",
    entityId: event.id,
    newValue: { name: data.name, slug },
  });

  revalidatePath("/admin/events");
  redirect(`/admin/events/${event.id}/edit`);
}

export async function updateEventAction(eventId: string, formData: FormData): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const parsed = parseEventForm(formData);
  if (!parsed.success) return fail("Please fix the highlighted fields.", parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const supabase = await createClient();
  const { data: existing } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
  if (!existing) return fail("Event not found.");

  const updates: Database["public"]["Tables"]["events"]["Update"] = {
    name: data.name,
    location: data.location || null,
    description: data.description || null,
    vendor_rules: data.vendorRules || null,
    setup_instructions: data.setupInstructions || null,
    start_at: new Date(data.startAt).toISOString(),
    end_at: new Date(data.endAt).toISOString(),
    setup_start_at: data.setupStartAt ? new Date(data.setupStartAt).toISOString() : null,
    setup_end_at: data.setupEndAt ? new Date(data.setupEndAt).toISOString() : null,
    registration_opens_at: data.registrationOpensAt ? new Date(data.registrationOpensAt).toISOString() : null,
    registration_closes_at: data.registrationClosesAt ? new Date(data.registrationClosesAt).toISOString() : null,
    payment_deadline_minutes: data.paymentDeadlineMinutes,
    booth_lock_minutes: data.boothLockMinutes,
    recommendations_enabled: data.recommendationsEnabled,
    booth_changes_locked: data.boothChangesLocked,
  };

  if (data.name !== existing.name) {
    updates.slug = await uniqueSlug(supabase, slugify(data.name), eventId);
  }

  const banner = formData.get("banner");
  if (banner instanceof File && banner.size > 0) {
    const path = await uploadOwnedFile(supabase, "event-banners", authUser.id, banner);
    updates.banner_url = supabase.storage.from("event-banners").getPublicUrl(path).data.publicUrl;
  }

  const { error } = await supabase.from("events").update(updates).eq("id", eventId);
  if (error) return fail("Could not save the event. Please try again.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "event.updated",
    entityType: "event",
    entityId: eventId,
    previousValue: { name: existing.name },
    newValue: { name: data.name },
  });

  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${eventId}/edit`);
  return { ok: true };
}

export async function duplicateEventAction(eventId: string): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: source } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
  if (!source) return fail("Event not found.");

  const name = `${source.name} (Copy)`;
  const slug = await uniqueSlug(supabase, slugify(name));

  const insert: EventInsert = {
    name,
    slug,
    location: source.location,
    description: source.description,
    vendor_rules: source.vendor_rules,
    setup_instructions: source.setup_instructions,
    banner_url: source.banner_url,
    start_at: source.start_at,
    end_at: source.end_at,
    setup_start_at: source.setup_start_at,
    setup_end_at: source.setup_end_at,
    payment_deadline_minutes: source.payment_deadline_minutes,
    booth_lock_minutes: source.booth_lock_minutes,
    recommendations_enabled: source.recommendations_enabled,
    registration_status: "draft",
    duplicated_from: source.id,
    created_by: authUser.id,
  };

  const { data: event, error } = await supabase.from("events").insert(insert).select("id").single();
  if (error || !event) return fail("Could not duplicate the event.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "event.duplicated",
    entityType: "event",
    entityId: event.id,
    metadata: { duplicated_from: source.id },
  });

  revalidatePath("/admin/events");
  return { ok: true };
}

async function setRegistrationStatus(
  eventId: string,
  status: "open" | "closed" | "archived" | "draft"
): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: existing } = await supabase.from("events").select("registration_status").eq("id", eventId).maybeSingle();
  if (!existing) return fail("Event not found.");

  const updates: Database["public"]["Tables"]["events"]["Update"] = { registration_status: status };
  if (status === "archived") updates.is_archived = true;

  const { error } = await supabase.from("events").update(updates).eq("id", eventId);
  if (error) {
    if (error.code === "23505") {
      return fail("Another event is already open for registration. Close it first.");
    }
    return fail("Could not update the event's registration status.");
  }

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: `event.registration_${status}`,
    entityType: "event",
    entityId: eventId,
    previousValue: { registration_status: existing.registration_status },
    newValue: { registration_status: status },
  });

  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${eventId}/edit`);
  revalidatePath("/vendor");
  return { ok: true };
}

export async function openRegistrationAction(eventId: string) {
  return setRegistrationStatus(eventId, "open");
}
export async function closeRegistrationAction(eventId: string) {
  return setRegistrationStatus(eventId, "closed");
}
export async function archiveEventAction(eventId: string) {
  return setRegistrationStatus(eventId, "archived");
}
