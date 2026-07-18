"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { sendNotification } from "@/lib/notifications";
import type { ActionResult } from "@/app/auth/actions";
import type { ApprovalStatus, Database } from "@/types/database";

type BusinessUpdate = Database["public"]["Tables"]["businesses"]["Update"];

function fail(error: string): ActionResult {
  return { ok: false, error };
}

async function transitionBusiness(
  businessId: string,
  nextStatus: ApprovalStatus,
  options: { reason?: string | null; clearReason?: boolean; requiresReapproval?: boolean } = {}
): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: business } = await supabase.from("businesses").select("*").eq("id", businessId).maybeSingle();
  if (!business) return fail("Vendor not found.");

  const updates: BusinessUpdate = {
    approval_status: nextStatus,
    reviewed_at: new Date().toISOString(),
    reviewed_by: authUser.id,
  };
  if (options.reason !== undefined) updates.rejection_reason = options.reason;
  else if (options.clearReason) updates.rejection_reason = null;
  if (options.requiresReapproval !== undefined) updates.requires_reapproval = options.requiresReapproval;

  const { error } = await supabase.from("businesses").update(updates).eq("id", businessId);
  if (error) return fail("Could not update this vendor. Please try again.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: `business.${nextStatus}`,
    entityType: "business",
    entityId: businessId,
    previousValue: { approval_status: business.approval_status },
    newValue: { approval_status: nextStatus, reason: options.reason ?? null },
  });

  if (nextStatus === "approved") {
    await sendNotification(supabase, { businessId, templateKey: "business_approved" });
  } else if (nextStatus === "rejected") {
    await sendNotification(supabase, {
      businessId,
      templateKey: "business_rejected",
      variables: { reason: options.reason ?? "" },
    });
  }

  revalidatePath("/admin/vendors");
  revalidatePath(`/admin/vendors/${businessId}`);
  revalidatePath("/admin");
  revalidatePath("/vendor");
  return { ok: true };
}

export async function approveBusinessAction(businessId: string): Promise<ActionResult> {
  return transitionBusiness(businessId, "approved", { clearReason: true, requiresReapproval: false });
}

export async function rejectBusinessAction(businessId: string, reason: string): Promise<ActionResult> {
  if (!reason.trim()) return fail("A rejection reason is required.");
  return transitionBusiness(businessId, "rejected", { reason: reason.trim() });
}

export async function suspendBusinessAction(businessId: string, reason: string): Promise<ActionResult> {
  if (!reason.trim()) return fail("A suspension reason is required.");
  return transitionBusiness(businessId, "suspended", { reason: reason.trim() });
}

export async function blacklistBusinessAction(businessId: string, reason: string): Promise<ActionResult> {
  if (!reason.trim()) return fail("A reason is required to blacklist a vendor.");
  return transitionBusiness(businessId, "blacklisted", { reason: reason.trim() });
}

export async function reconsiderBusinessAction(businessId: string): Promise<ActionResult> {
  return transitionBusiness(businessId, "pending_review", { clearReason: true });
}

export async function bulkApproveBusinessesAction(businessIds: string[]): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: businesses } = await supabase.from("businesses").select("id, approval_status").in("id", businessIds);
  if (!businesses?.length) return fail("No vendors selected.");

  const { error } = await supabase
    .from("businesses")
    .update({
      approval_status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: authUser.id,
      rejection_reason: null,
      requires_reapproval: false,
    })
    .in("id", businessIds);

  if (error) return fail("Could not approve the selected vendors.");

  await Promise.all(
    businesses.map((b) =>
      logAudit(supabase, {
        actorId: authUser.id,
        actorRole: "admin",
        action: "business.approved",
        entityType: "business",
        entityId: b.id,
        previousValue: { approval_status: b.approval_status },
        newValue: { approval_status: "approved" },
        metadata: { bulk: true },
      })
    )
  );

  revalidatePath("/admin/vendors");
  revalidatePath("/admin");
  return { ok: true };
}
