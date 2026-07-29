"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import {
  getOwnedPublicFilePath,
  removeSupersededOwnedFile,
  uploadOwnedFile,
} from "@/lib/storage";
import { eventFormSchema, slugify } from "@/lib/validations/event";
import type { ActionResult } from "@/app/auth/actions";
import type { Database } from "@/types/database";

type EventInsert = Database["public"]["Tables"]["events"]["Insert"];
const MAX_EVENT_BANNER_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_EVENT_BANNER_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult {
  return { ok: false, error, fieldErrors };
}

function validateEventBanner(formData: FormData): ActionResult | null {
  const banner = formData.get("banner");
  if (!(banner instanceof File) || banner.size === 0) return null;
  if (banner.size > MAX_EVENT_BANNER_SIZE_BYTES) {
    return fail("Event banner is too large.", { banner: ["Must be 5 MB or smaller."] });
  }
  if (!ACCEPTED_EVENT_BANNER_TYPES.has(banner.type)) {
    return fail("Unsupported event banner format.", { banner: ["Use PNG, JPEG, or WEBP."] });
  }
  return null;
}

async function cleanupEventBanner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string | null
) {
  if (!path) return;
  try {
    const { error } = await supabase.storage.from("event-banners").remove([path]);
    if (error) console.error("Event banner cleanup failed.", error.message);
  } catch {
    console.error("Event banner cleanup failed.");
  }
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
    paymentDeadlineMinutes: Number(formData.get("paymentDeadlineMinutes")),
    boothLockMinutes: Number(formData.get("boothLockMinutes")),
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
  const bannerError = validateEventBanner(formData);
  if (bannerError) return bannerError;
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
  let uploadedBannerPath: string | null = null;
  if (banner instanceof File && banner.size > 0) {
    try {
      uploadedBannerPath = await uploadOwnedFile(supabase, "event-banners", authUser.id, banner);
      insert.banner_url = supabase.storage.from("event-banners").getPublicUrl(uploadedBannerPath).data.publicUrl;
    } catch {
      return fail("Could not upload the event banner. Please try again.");
    }
  }

  const { data: event, error } = await supabase.from("events").insert(insert).select("id").single();
  if (error || !event) {
    await cleanupEventBanner(supabase, uploadedBannerPath);
    return fail("Could not create the event. Please try again.");
  }

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
  const bannerError = validateEventBanner(formData);
  if (bannerError) return bannerError;
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
  let uploadedBannerPath: string | null = null;
  if (banner instanceof File && banner.size > 0) {
    try {
      uploadedBannerPath = await uploadOwnedFile(supabase, "event-banners", authUser.id, banner);
      updates.banner_url = supabase.storage.from("event-banners").getPublicUrl(uploadedBannerPath).data.publicUrl;
    } catch {
      return fail("Could not upload the event banner. Please try again.");
    }
  }

  const { data: updatedEvent, error } = await supabase
    .from("events")
    .update(updates)
    .eq("id", eventId)
    .select("id")
    .maybeSingle();
  if (error || !updatedEvent) {
    await cleanupEventBanner(supabase, uploadedBannerPath);
    return fail("Could not save the event. Please try again.");
  }

  if (uploadedBannerPath && existing.banner_url) {
    const { data: anotherReference, error: referenceError } = await supabase
      .from("events")
      .select("id")
      .eq("banner_url", existing.banner_url)
      .neq("id", eventId)
      .limit(1)
      .maybeSingle();
    if (referenceError) {
      console.error("Superseded event banner reference check failed.", referenceError.message);
    } else if (!anotherReference) {
      await removeSupersededOwnedFile(
        supabase,
        "event-banners",
        getOwnedPublicFilePath(supabase, "event-banners", existing.banner_url),
        uploadedBannerPath
      );
    }
  }

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
    registration_opens_at: source.registration_opens_at,
    registration_closes_at: source.registration_closes_at,
    payment_deadline_minutes: source.payment_deadline_minutes,
    booth_lock_minutes: source.booth_lock_minutes,
    recommendations_enabled: source.recommendations_enabled,
    booth_changes_locked: source.booth_changes_locked,
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
  status: "open" | "closed" | "archived"
): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: existing, error: lookupError } = await supabase
    .from("events")
    .select("registration_status, is_archived")
    .eq("id", eventId)
    .maybeSingle();
  if (lookupError) return fail("Could not load the event.");
  if (!existing) return fail("Event not found.");
  if (status === "open" && (existing.is_archived || !["draft", "closed"].includes(existing.registration_status))) {
    return fail("Only a draft or closed, unarchived event can be opened.");
  }
  if (status === "closed" && existing.registration_status !== "open") {
    return fail("Only an open event can be closed.");
  }
  if (status === "archived" && existing.is_archived) {
    return fail("This event is already archived.");
  }

  const updates: Database["public"]["Tables"]["events"]["Update"] = { registration_status: status };
  if (status === "archived") updates.is_archived = true;

  const { data: updated, error } = await supabase
    .from("events")
    .update(updates)
    .eq("id", eventId)
    .eq("registration_status", existing.registration_status)
    .eq("is_archived", existing.is_archived)
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return fail("Another event is already open for registration. Close it first.");
    }
    return fail("Could not update the event's registration status.");
  }
  if (!updated) {
    return fail("This event changed while you were reviewing it. Refresh and try again.");
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
