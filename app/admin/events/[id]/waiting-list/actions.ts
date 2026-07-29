"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { sendNotification } from "@/lib/notifications";
import type { ActionResult } from "@/app/auth/actions";

function fail(error: string): ActionResult {
  return { ok: false, error };
}

const INVITATION_MINUTES = 30;

export async function reorderPriorityAction(entryId: string, eventId: string, direction: "up" | "down"): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_waiting_list", {
    p_entry_id: entryId,
    p_event_id: eventId,
    p_direction: direction,
  });
  if (error) return fail("Could not reorder this entry. Refresh and try again.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "waiting_list.reordered",
    entityType: "waiting_list",
    entityId: entryId,
    metadata: { event_id: eventId, direction },
  });

  revalidatePath(`/admin/events/${eventId}/waiting-list`);
  return { ok: true };
}

export async function addWaitingListNoteAction(entryId: string, eventId: string, notes: string): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();
  const normalizedNotes = notes.trim();
  if (normalizedNotes.length > 2000) return fail("Keep the note under 2,000 characters.");
  const { data: updated, error } = await supabase
    .from("waiting_list")
    .update({ admin_notes: normalizedNotes || null })
    .eq("id", entryId)
    .eq("event_id", eventId)
    .select("id")
    .maybeSingle();
  if (error || !updated) return fail("Could not save the note.");
  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "waiting_list.note_added",
    entityType: "waiting_list",
    entityId: entryId,
  });
  revalidatePath(`/admin/events/${eventId}/waiting-list`);
  return { ok: true };
}

export async function removeFromWaitingListAction(entryId: string, eventId: string): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();
  const { data: removed, error } = await supabase
    .from("waiting_list")
    .update({ status: "removed" })
    .eq("id", entryId)
    .eq("event_id", eventId)
    .eq("status", "waiting")
    .select("id")
    .maybeSingle();
  if (error || !removed) return fail("This vendor is no longer waiting.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "waiting_list.removed",
    entityType: "waiting_list",
    entityId: entryId,
    metadata: { event_id: eventId },
  });
  revalidatePath(`/admin/events/${eventId}/waiting-list`);
  return { ok: true };
}

export async function inviteFromWaitingListAction(entryId: string, eventId: string, boothId: string): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();
  const { data: entry, error: inviteError } = await supabase.rpc("invite_from_waiting_list", {
    p_entry_id: entryId,
    p_event_id: eventId,
    p_booth_id: boothId,
  });
  if (inviteError || !entry) {
    return fail("Could not send the invitation. The event or booth availability may have changed.");
  }

  const { data: booth } = await supabase
    .from("booths")
    .select("booth_number")
    .eq("id", boothId)
    .eq("event_id", eventId)
    .maybeSingle();

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "waiting_list.invited",
    entityType: "waiting_list",
    entityId: entryId,
    newValue: { booth_id: boothId, expires_at: entry.invitation_expires_at },
  });

  await sendNotification(supabase, {
    businessId: entry.business_id,
    templateKey: "booth_availability_invitation",
    variables: { booth_number: booth?.booth_number ?? "selected", minutes: String(INVITATION_MINUTES) },
  });

  revalidatePath(`/admin/events/${eventId}/waiting-list`);
  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true };
}

export async function releaseExpiredInvitationsAction(eventId: string): Promise<ActionResult & { count?: number }> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("release_expired_invitations", { p_event_id: eventId });
  if (error) return fail("Could not sweep expired invitations.");
  revalidatePath(`/admin/events/${eventId}/waiting-list`);
  return { ok: true, count: data ?? 0 };
}
