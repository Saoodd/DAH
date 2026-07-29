"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedBusiness, requireVendor } from "@/lib/dal";
import { sendTrustedNotification } from "@/lib/notifications";
import type { ActionResult } from "@/app/auth/actions";

const FRIENDLY_ERRORS: Record<string, string> = {
  NO_BUSINESS: "We couldn't find your business profile.",
  BUSINESS_NOT_APPROVED: "Your business must be approved before selecting a booth.",
  BUSINESS_REAPPROVAL_REQUIRED:
    "Your updated business profile must be approved before selecting a booth.",
  EVENT_NOT_OPEN: "Booth selection is no longer open for this event.",
  EVENT_NOT_ACTIVE: "This event is no longer active.",
  BOOTH_NOT_FOUND: "That booth no longer exists.",
  APPLICATION_NOT_ELIGIBLE: "You need an approved application for this event first.",
  BOOTH_UNAVAILABLE: "Someone else just selected this booth. Please choose another.",
  NOT_YOUR_LOCK: "This booth isn't currently held by you.",
  LOCK_EXPIRED_OR_INVALID: "Your hold on this booth expired. Please select it again.",
  NOT_YOUR_BOOTH: "This isn't your current booth.",
  BOOTH_NOT_CHANGEABLE: "You can only change booths before payment is confirmed.",
  CHANGES_LOCKED: "The event organizer has locked booth changes.",
  PAYMENT_STATE_CONFLICT:
    "This booth can't be reconfirmed because its payment is already being processed.",
};

function translateError(error: { message: string } | null): string {
  if (!error) return "Something went wrong. Please try again.";
  const code = Object.keys(FRIENDLY_ERRORS).find((key) => error.message.includes(key));
  return code ? FRIENDLY_ERRORS[code] : "Something went wrong. Please try again.";
}

export async function lockBoothAction(boothId: string, lockMinutes: number): Promise<ActionResult> {
  const business = await requireOwnedBusiness();
  const supabase = await createClient();
  const { data: booth, error } = await supabase.rpc("lock_booth", { p_booth_id: boothId, p_lock_minutes: lockMinutes });
  if (error) return { ok: false, error: translateError(error) };

  const { data: event } = await supabase
    .from("events")
    .select("booth_lock_minutes")
    .eq("id", booth?.event_id ?? "")
    .maybeSingle();
  await sendTrustedNotification({
    businessId: business.id,
    templateKey: "booth_locked",
    variables: { booth_number: booth?.booth_number ?? "", minutes: String(event?.booth_lock_minutes ?? 5) },
    channels: ["email"],
  });

  revalidatePath("/vendor/booths");
  revalidatePath("/vendor");
  return { ok: true };
}

export async function releaseBoothLockAction(boothId: string): Promise<ActionResult> {
  await requireVendor();
  const supabase = await createClient();
  const { error } = await supabase.rpc("release_booth_lock", { p_booth_id: boothId, p_reason: "vendor_cancelled" });
  if (error) return { ok: false, error: translateError(error) };
  revalidatePath("/vendor/booths");
  revalidatePath("/vendor");
  return { ok: true };
}

export async function confirmBoothSelectionAction(boothId: string): Promise<ActionResult> {
  const business = await requireOwnedBusiness();
  const supabase = await createClient();
  const { data: booth, error } = await supabase.rpc("confirm_booth_selection", { p_booth_id: boothId });
  if (error) return { ok: false, error: translateError(error) };

  const { data: event } = await supabase.from("events").select("payment_deadline_minutes").eq("id", booth?.event_id ?? "").maybeSingle();
  await sendTrustedNotification({
    businessId: business.id,
    templateKey: "payment_required",
    variables: {
      booth_number: booth?.booth_number ?? "",
      minutes: String(event?.payment_deadline_minutes ?? 60),
    },
  });

  revalidatePath("/vendor/booths");
  revalidatePath("/vendor");
  return { ok: true };
}

export async function changeBoothAction(oldBoothId: string, newBoothId: string, lockMinutes: number): Promise<ActionResult> {
  await requireVendor();
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_booth", {
    p_old_booth_id: oldBoothId,
    p_new_booth_id: newBoothId,
    p_lock_minutes: lockMinutes,
  });
  if (error) return { ok: false, error: translateError(error) };
  revalidatePath("/vendor/booths");
  revalidatePath("/vendor");
  return { ok: true };
}
