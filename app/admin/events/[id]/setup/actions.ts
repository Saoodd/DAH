"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { uploadOwnedFile } from "@/lib/storage";
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

function fail(error: string): ActionResult {
  return { ok: false, error };
}

async function ensureChecklist(supabase: Awaited<ReturnType<typeof createClient>>, applicationId: string) {
  const { data: existing } = await supabase.from("setup_checklists").select("id").eq("application_id", applicationId).maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await supabase
    .from("setup_checklists")
    .insert({ application_id: applicationId, qr_code: applicationId })
    .select("id")
    .single();
  return created?.id;
}

export async function updateChecklistAction(applicationId: string, eventId: string, formData: FormData): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  await ensureChecklist(supabase, applicationId);

  const updates: ChecklistUpdate = { checked_by: authUser.id };
  for (const field of CHECKLIST_FIELDS) {
    updates[field] = formData.get(field) === "on";
  }
  updates.issue_found = String(formData.get("issue_found") ?? "").trim() || null;
  updates.notes = String(formData.get("notes") ?? "").trim() || null;

  if (!updates.checkin_time) {
    const { data: current } = await supabase.from("setup_checklists").select("checkin_time").eq("application_id", applicationId).maybeSingle();
    if (!current?.checkin_time && updates.vendor_arrived) {
      updates.checkin_time = new Date().toISOString();
    }
  }

  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const path = await uploadOwnedFile(supabase, "setup-photos", authUser.id, photo);
    updates.photo_url = path;
  }

  const { error } = await supabase.from("setup_checklists").update(updates).eq("application_id", applicationId);
  if (error) return fail("Could not save the checklist.");

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
  await ensureChecklist(supabase, applicationId);

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
  await ensureChecklist(supabase, applicationId);

  const { error } = await supabase
    .from("setup_checklists")
    .update({ final_approval: false, issue_found: issue, issue_resolved: false, checked_by: authUser.id })
    .eq("application_id", applicationId);
  if (error) return fail("Could not record the issue.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "setup_checklist.needs_changes",
    entityType: "setup_checklist",
    entityId: applicationId,
    newValue: { issue },
  });

  revalidatePath(`/admin/events/${eventId}/setup/${applicationId}`);
  revalidatePath(`/admin/events/${eventId}/setup`);
  return { ok: true };
}
