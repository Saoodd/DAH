"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { removeSupersededOwnedFile, uploadOwnedFile } from "@/lib/storage";
import type { ActionResult } from "@/app/auth/actions";
import type { Database } from "@/types/database";

type ChecklistUpdate = Database["public"]["Tables"]["setup_checklists"]["Update"];

const CHECKLIST_FIELDS = [
  "vendor_arrived",
  "identity_confirmed",
  "booth_number_confirmed",
  "products_match_category",
  "setup_follows_dimensions",
  "electrical_checked",
  "no_blocked_aisles",
  "safety_check_completed",
  "booth_appearance_approved",
  "issue_resolved",
] as const;

const REQUIRED_APPROVAL_FIELDS = CHECKLIST_FIELDS.filter(
  (field) => field !== "issue_resolved"
);
const MAX_SETUP_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_SETUP_PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];

function fail(error: string): ActionResult {
  return { ok: false, error };
}

async function ensureChecklist(supabase: Awaited<ReturnType<typeof createClient>>, applicationId: string) {
  const { data: existing, error: lookupError } = await supabase
    .from("setup_checklists")
    .select("id")
    .eq("application_id", applicationId)
    .maybeSingle();
  if (lookupError) return null;
  if (existing) return existing.id;
  const { data: created, error: createError } = await supabase
    .from("setup_checklists")
    .insert({ application_id: applicationId, qr_code: applicationId })
    .select("id")
    .single();
  return createError ? null : created?.id ?? null;
}

async function applicationBelongsToEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  applicationId: string,
  eventId: string
) {
  const { data, error } = await supabase
    .from("applications")
    .select("id")
    .eq("id", applicationId)
    .eq("event_id", eventId)
    .maybeSingle();
  return !error && Boolean(data);
}

export async function updateChecklistAction(applicationId: string, eventId: string, formData: FormData): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  if (!(await applicationBelongsToEvent(supabase, applicationId, eventId))) {
    return fail("This checklist does not belong to the selected event.");
  }
  if (!(await ensureChecklist(supabase, applicationId))) return fail("Could not prepare the checklist.");

  const updates: ChecklistUpdate = { checked_by: authUser.id };
  for (const field of CHECKLIST_FIELDS) {
    updates[field] = formData.get(field) === "on";
  }
  const issueFound = String(formData.get("issue_found") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (issueFound.length > 2000) return fail("Keep the issue description under 2,000 characters.");
  if (notes.length > 5000) return fail("Keep the notes under 5,000 characters.");
  updates.issue_found = issueFound || null;
  updates.notes = notes || null;
  if (
    REQUIRED_APPROVAL_FIELDS.some((field) => updates[field] !== true) ||
    (updates.issue_found && updates.issue_resolved !== true)
  ) {
    updates.final_approval = false;
  }

  const { data: current, error: currentError } = await supabase
    .from("setup_checklists")
    .select("checkin_time, photo_url")
    .eq("application_id", applicationId)
    .maybeSingle();
  if (currentError || !current) return fail("Could not load the checklist.");
  if (!current.checkin_time && updates.vendor_arrived) {
    updates.checkin_time = new Date().toISOString();
  }

  const photo = formData.get("photo");
  let uploadedPhotoPath: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > MAX_SETUP_PHOTO_SIZE_BYTES) {
      return fail("Setup photos must be 5 MB or smaller.");
    }
    if (!ACCEPTED_SETUP_PHOTO_TYPES.includes(photo.type)) {
      return fail("Use a PNG, JPEG, or WEBP setup photo.");
    }
    try {
      uploadedPhotoPath = await uploadOwnedFile(supabase, "setup-photos", authUser.id, photo);
      updates.photo_url = uploadedPhotoPath;
    } catch {
      return fail("Could not upload the setup photo. Please try again.");
    }
  }

  const { data: updatedChecklist, error } = await supabase
    .from("setup_checklists")
    .update(updates)
    .eq("application_id", applicationId)
    .select("id")
    .maybeSingle();
  if (error || !updatedChecklist) {
    if (uploadedPhotoPath) {
      try {
        await supabase.storage.from("setup-photos").remove([uploadedPhotoPath]);
      } catch {
        console.error("Setup photo cleanup failed.");
      }
    }
    return fail("Could not save the checklist.");
  }

  if (uploadedPhotoPath && current.photo_url) {
    const { data: anotherReference, error: referenceError } = await supabase
      .from("setup_checklists")
      .select("id")
      .eq("photo_url", current.photo_url)
      .neq("application_id", applicationId)
      .limit(1)
      .maybeSingle();
    if (referenceError) {
      console.error("Superseded setup photo reference check failed.", referenceError.message);
    } else if (!anotherReference) {
      await removeSupersededOwnedFile(
        supabase,
        "setup-photos",
        current.photo_url,
        uploadedPhotoPath
      );
    }
  }

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "setup_checklist.updated",
    entityType: "setup_checklist",
    entityId: applicationId,
  });

  revalidatePath(`/admin/events/${eventId}/setup/${applicationId}`);
  return { ok: true };
}

export async function markSetupApprovedAction(applicationId: string, eventId: string): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();
  if (!(await applicationBelongsToEvent(supabase, applicationId, eventId))) {
    return fail("This checklist does not belong to the selected event.");
  }
  if (!(await ensureChecklist(supabase, applicationId))) return fail("Could not prepare the checklist.");

  const { data: checklist, error: checklistError } = await supabase
    .from("setup_checklists")
    .select("*")
    .eq("application_id", applicationId)
    .maybeSingle();
  if (checklistError || !checklist) return fail("Could not load the checklist.");
  const missingRequired = REQUIRED_APPROVAL_FIELDS.some((field) => checklist[field] !== true);
  if (missingRequired) return fail("Complete every required setup check before approving this booth.");
  if (checklist.issue_found && !checklist.issue_resolved) {
    return fail("Resolve the recorded issue before approving this booth.");
  }

  const { error } = await supabase
    .from("setup_checklists")
    .update({ final_approval: true, checked_by: authUser.id })
    .eq("application_id", applicationId);
  if (error) return fail("Could not mark setup as approved.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "setup_checklist.approved",
    entityType: "setup_checklist",
    entityId: applicationId,
  });

  revalidatePath(`/admin/events/${eventId}/setup/${applicationId}`);
  revalidatePath(`/admin/events/${eventId}/setup`);
  return { ok: true };
}

export async function markNeedsChangesAction(applicationId: string, eventId: string, issue: string): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();
  if (!(await applicationBelongsToEvent(supabase, applicationId, eventId))) {
    return fail("This checklist does not belong to the selected event.");
  }
  if (!(await ensureChecklist(supabase, applicationId))) return fail("Could not prepare the checklist.");

  const normalizedIssue = issue.trim();
  if (normalizedIssue.length < 5) return fail("Describe the issue before requesting changes.");
  if (normalizedIssue.length > 2000) return fail("Keep the issue description under 2,000 characters.");

  const { error } = await supabase
    .from("setup_checklists")
    .update({ final_approval: false, issue_found: normalizedIssue, issue_resolved: false, checked_by: authUser.id })
    .eq("application_id", applicationId);
  if (error) return fail("Could not record the issue.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "setup_checklist.needs_changes",
    entityType: "setup_checklist",
    entityId: applicationId,
    newValue: { issue: normalizedIssue },
  });

  revalidatePath(`/admin/events/${eventId}/setup/${applicationId}`);
  revalidatePath(`/admin/events/${eventId}/setup`);
  return { ok: true };
}
