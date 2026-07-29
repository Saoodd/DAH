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

function normalizeDecisionReason(reason: string, label: string): ActionResult | string {
  const normalized = reason.trim();
  if (!normalized) return fail(`${label} reason is required.`);
  if (normalized.length > 2_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) {
    return fail("Keep the reason under 2,000 characters and remove control characters.");
  }
  return normalized;
}

async function transitionBusiness(
  businessId: string,
  nextStatus: ApprovalStatus,
  options: {
    allowedFrom: ApprovalStatus[];
    reason?: string | null;
    clearReason?: boolean;
    requiresReapproval?: boolean;
  }
): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: business } = await supabase.from("businesses").select("*").eq("id", businessId).maybeSingle();
  if (!business) return fail("Vendor not found.");
  if (!options.allowedFrom.includes(business.approval_status)) {
    return fail("This vendor's status changed. Refresh the page before taking another action.");
  }

  const updates: BusinessUpdate = {
    approval_status: nextStatus,
    reviewed_at: new Date().toISOString(),
    reviewed_by: authUser.id,
  };
  if (options.reason !== undefined) updates.rejection_reason = options.reason;
  else if (options.clearReason) updates.rejection_reason = null;
  if (options.requiresReapproval !== undefined) updates.requires_reapproval = options.requiresReapproval;

  const { data: updated, error } = await supabase
    .from("businesses")
    .update(updates)
    .eq("id", businessId)
    .eq("approval_status", business.approval_status)
    .select("id")
    .maybeSingle();
  if (error) return fail("Could not update this vendor. Please try again.");
  if (!updated) return fail("This vendor's status changed. Refresh and try again.");

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
  return transitionBusiness(businessId, "approved", {
    allowedFrom: ["pending_review"],
    clearReason: true,
    requiresReapproval: false,
  });
}

export async function rejectBusinessAction(businessId: string, reason: string): Promise<ActionResult> {
  const normalized = normalizeDecisionReason(reason, "A rejection");
  if (typeof normalized !== "string") return normalized;
  return transitionBusiness(businessId, "rejected", {
    allowedFrom: ["pending_review"],
    reason: normalized,
  });
}

export async function suspendBusinessAction(businessId: string, reason: string): Promise<ActionResult> {
  const normalized = normalizeDecisionReason(reason, "A suspension");
  if (typeof normalized !== "string") return normalized;
  return transitionBusiness(businessId, "suspended", {
    allowedFrom: ["approved"],
    reason: normalized,
  });
}

export async function blacklistBusinessAction(businessId: string, reason: string): Promise<ActionResult> {
  const normalized = normalizeDecisionReason(reason, "A blacklist");
  if (typeof normalized !== "string") return normalized;
  return transitionBusiness(businessId, "blacklisted", {
    allowedFrom: ["pending_review", "approved", "rejected", "suspended"],
    reason: normalized,
  });
}

export async function reconsiderBusinessAction(businessId: string): Promise<ActionResult> {
  return transitionBusiness(businessId, "pending_review", {
    allowedFrom: ["rejected", "suspended", "blacklisted"],
    clearReason: true,
  });
}

export async function bulkApproveBusinessesAction(businessIds: string[]): Promise<ActionResult> {
  const uniqueIds = [...new Set(businessIds)];
  if (uniqueIds.length === 0) return fail("No vendors selected.");
  if (uniqueIds.length > 200) return fail("Approve no more than 200 vendors at a time.");
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: businesses, error: fetchError } = await supabase
    .from("businesses")
    .select("id, approval_status")
    .in("id", uniqueIds);
  if (fetchError) return fail("Could not load the selected vendors.");
  if (!businesses?.length) return fail("No vendors selected.");
  if (businesses.length !== uniqueIds.length || businesses.some((business) => business.approval_status !== "pending_review")) {
    return fail("Only vendors pending review can be approved. Refresh the list and try again.");
  }

  const { data: updated, error } = await supabase
    .from("businesses")
    .update({
      approval_status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: authUser.id,
      rejection_reason: null,
      requires_reapproval: false,
    })
    .in("id", uniqueIds)
    .eq("approval_status", "pending_review")
    .select("id");

  if (error) return fail("Could not approve the selected vendors.");
  if (!updated || updated.length !== uniqueIds.length) {
    return fail("A vendor's status changed during approval. Refresh the list before continuing.");
  }

  await Promise.all(
    businesses.flatMap((b) => [
      logAudit(supabase, {
        actorId: authUser.id,
        actorRole: "admin",
        action: "business.approved",
        entityType: "business",
        entityId: b.id,
        previousValue: { approval_status: b.approval_status },
        newValue: { approval_status: "approved" },
        metadata: { bulk: true },
      }),
      sendNotification(supabase, { businessId: b.id, templateKey: "business_approved" }),
    ])
  );

  revalidatePath("/admin/vendors");
  revalidatePath("/admin");
  return { ok: true };
}
