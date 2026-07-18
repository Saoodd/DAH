"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedBusiness } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { sendNotification } from "@/lib/notifications";
import type { ActionResult } from "@/app/auth/actions";

function fail(error: string): ActionResult {
  return { ok: false, error };
}

export async function joinWaitingListAction(eventId: string, formData: FormData): Promise<ActionResult> {
  const business = await requireOwnedBusiness();
  const supabase = await createClient();

  const preferredBoothSize = String(formData.get("preferredBoothSize") ?? "").trim();
  const maxBudgetRaw = String(formData.get("maxBudget") ?? "");
  const preferredZoneId = String(formData.get("preferredZoneId") ?? "");

  // Vendors have no direct INSERT/UPDATE grant on waiting_list (migration
  // 0008) — priority is admin-only, so this can't be used to queue-jump.
  const { error } = await supabase.rpc("join_waiting_list", {
    p_event_id: eventId,
    p_preferred_booth_size: preferredBoothSize || null,
    p_max_budget: maxBudgetRaw ? Number(maxBudgetRaw) : null,
    p_preferred_zone_id: preferredZoneId || null,
  });
  if (error) return fail("Could not join the waiting list.");

  await logAudit(supabase, {
    actorId: business.owner_id,
    actorRole: "vendor",
    action: "waiting_list.joined",
    entityType: "waiting_list",
    entityId: null,
    newValue: { event_id: eventId },
  });

  await sendNotification(supabase, { businessId: business.id, templateKey: "waitlist_joined" });

  revalidatePath("/vendor/booths");
  return { ok: true };
}

export async function acceptInvitationAction(boothId: string, lockMinutes: number): Promise<ActionResult> {
  await requireOwnedBusiness();
  const supabase = await createClient();

  // lock_booth (migration 0009) flips the waiting_list row to 'accepted'
  // itself once it confirms the booth was admin_held for this business —
  // vendors have no direct UPDATE grant on waiting_list.
  const { error: lockError } = await supabase.rpc("lock_booth", { p_booth_id: boothId, p_lock_minutes: lockMinutes });
  if (lockError) return fail("This booth is no longer available. It may have expired.");

  revalidatePath("/vendor/booths");
  revalidatePath("/vendor");
  return { ok: true };
}

export async function declineInvitationAction(waitingListId: string): Promise<ActionResult> {
  await requireOwnedBusiness();
  const supabase = await createClient();

  const { error } = await supabase.rpc("decline_booth_invitation", { p_waiting_list_id: waitingListId });
  if (error) return fail("Could not decline this invitation.");

  revalidatePath("/vendor/booths");
  return { ok: true };
}
