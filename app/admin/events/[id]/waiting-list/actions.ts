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
  await requireAdmin();
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from("waiting_list")
    .select("id, priority")
    .eq("event_id", eventId)
    .eq("status", "waiting")
    .order("priority", { ascending: false });
  if (!entries) return fail("Waiting list not found.");

  const index = entries.findIndex((e) => e.id === entryId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= entries.length) return { ok: true };

  const a = entries[index];
  const b = entries[swapIndex];

  await supabase.from("waiting_list").update({ priority: b.priority }).eq("id", a.id);
  await supabase.from("waiting_list").update({ priority: a.priority }).eq("id", b.id);

  revalidatePath(`/admin/events/${eventId}/waiting-list`);
  return { ok: true };
}

export async function addWaitingListNoteAction(entryId: string, eventId: string, notes: string): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("waiting_list").update({ admin_notes: notes }).eq("id", entryId);
  if (error) return fail("Could not save the note.");
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
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("waiting_list").update({ status: "removed" }).eq("id", entryId);
  if (error) return fail("Could not remove this entry.");
  revalidatePath(`/admin/events/${eventId}/waiting-list`);
  return { ok: true };
}

export async function inviteFromWaitingListAction(entryId: string, eventId: string, boothId: string): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: entry } = await supabase.from("waiting_list").select("id, business_id, status").eq("id", entryId).maybeSingle();
  if (!entry || entry.status !== "waiting") return fail("This vendor is no longer waiting.");

  const { data: booth } = await supabase.from("booths").select("id, booth_number, status").eq("id", boothId).maybeSingle();
  if (!booth || booth.status !== "available") return fail("That booth is no longer available.");

  const expiresAt = new Date(Date.now() + INVITATION_MINUTES * 60_000).toISOString();

  const { error: boothError } = await supabase
    .from("booths")
    .update({ status: "admin_held", held_for_business_id: entry.business_id })
    .eq("id", boothId);
  if (boothError) return fail("Could not hold this booth.");

  const { error: entryError } = await supabase
    .from("waiting_list")
    .update({ status: "invited", invited_booth_id: boothId, invitation_expires_at: expiresAt })
    .eq("id", entryId);
  if (entryError) return fail("Could not send the invitation.");

  await supabase
    .from("booth_events")
    .insert({ booth_id: boothId, event_type: "admin_held", business_id: entry.business_id, actor_id: authUser.id });

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "waiting_list.invited",
    entityType: "waiting_list",
    entityId: entryId,
    newValue: { booth_id: boothId, expires_at: expiresAt },
  });

  await sendNotification(supabase, {
    businessId: entry.business_id,
    templateKey: "booth_availability_invitation",
    variables: { booth_number: booth.booth_number, minutes: String(INVITATION_MINUTES) },
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
