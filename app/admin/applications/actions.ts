"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/app/auth/actions";

function fail(error: string): ActionResult {
  return { ok: false, error };
}

export async function approveApplicationAction(applicationId: string): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: application } = await supabase
    .from("applications")
    .select("id, status, event_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!application) return fail("Application not found.");

  const { error } = await supabase
    .from("applications")
    .update({ status: "approved", reviewed_at: new Date().toISOString() })
    .eq("id", applicationId);
  if (error) return fail("Could not approve this application.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "application.approved",
    entityType: "application",
    entityId: applicationId,
    previousValue: { status: application.status },
    newValue: { status: "approved" },
  });

  revalidatePath(`/admin/events/${application.event_id}/applications`);
  revalidatePath("/vendor");
  return { ok: true };
}

export async function rejectApplicationAction(applicationId: string, reason: string): Promise<ActionResult> {
  if (!reason.trim()) return fail("A rejection reason is required.");
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: application } = await supabase
    .from("applications")
    .select("id, status, event_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!application) return fail("Application not found.");

  const { error } = await supabase
    .from("applications")
    .update({ status: "rejected", rejection_reason: reason.trim(), reviewed_at: new Date().toISOString() })
    .eq("id", applicationId);
  if (error) return fail("Could not reject this application.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "application.rejected",
    entityType: "application",
    entityId: applicationId,
    previousValue: { status: application.status },
    newValue: { status: "rejected", reason },
  });

  revalidatePath(`/admin/events/${application.event_id}/applications`);
  revalidatePath("/vendor");
  return { ok: true };
}
