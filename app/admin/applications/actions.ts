"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/app/auth/actions";

function fail(error: string): ActionResult {
  return { ok: false, error };
}
const REVIEWABLE_STATUSES = ["submitted", "under_review"] as const;


export async function approveApplicationAction(applicationId: string): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: application } = await supabase
    .from("applications")
    .select("id, status, event_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!application) return fail("Application not found.");
  if (!REVIEWABLE_STATUSES.includes(application.status as (typeof REVIEWABLE_STATUSES)[number])) {
    return fail("Only a submitted application can be approved.");
  }

  const { data: updated, error } = await supabase
    .from("applications")
    .update({ status: "approved", reviewed_at: new Date().toISOString() })
    .eq("id", applicationId)
    .in("status", [...REVIEWABLE_STATUSES])
    .select("id")
    .maybeSingle();
  if (error) return fail("Could not approve this application.");
  if (!updated) return fail("This application changed while you were reviewing it. Refresh and try again.");

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
  const normalizedReason = reason.trim();
  if (!normalizedReason) return fail("A rejection reason is required.");
  if (normalizedReason.length > 2_000) return fail("Keep the rejection reason under 2,000 characters.");
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: application } = await supabase
    .from("applications")
    .select("id, status, event_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!application) return fail("Application not found.");
  if (!REVIEWABLE_STATUSES.includes(application.status as (typeof REVIEWABLE_STATUSES)[number])) {
    return fail("Only a submitted application can be rejected.");
  }

  const { data: updated, error } = await supabase
    .from("applications")
    .update({ status: "rejected", rejection_reason: normalizedReason, reviewed_at: new Date().toISOString() })
    .eq("id", applicationId)
    .in("status", [...REVIEWABLE_STATUSES])
    .select("id")
    .maybeSingle();
  if (error) return fail("Could not reject this application.");
  if (!updated) return fail("This application changed while you were reviewing it. Refresh and try again.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "application.rejected",
    entityType: "application",
    entityId: applicationId,
    previousValue: { status: application.status },
    newValue: { status: "rejected", reason: normalizedReason },
  });

  revalidatePath(`/admin/events/${application.event_id}/applications`);
  revalidatePath("/vendor");
  return { ok: true };
}
