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

const MAX_PAYMENT_MINUTES = 10_080;
const MAX_PAYMENT_AMOUNT = 99_999_999.99;
const MAX_REASON_LENGTH = 2_000;
const MAX_NOTES_LENGTH = 5_000;

function validWholeMinutes(value: number, minimum: number): boolean {
  return Number.isInteger(value) && value >= minimum && value <= MAX_PAYMENT_MINUTES;
}

function normalizedMoney(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_PAYMENT_AMOUNT) return null;
  return Math.round(value * 100) / 100;
}

function normalizeHttpsPaymentLink(value: string): string | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2_048 || /[\u0000-\u001f\u007f]/.test(trimmed)) return undefined;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function paymentMutationError(
  error: { message: string } | null,
  fallback: string
): ActionResult {
  const message = error?.message ?? "";
  if (message.includes("PAYMENT_NOT_FOUND")) return fail("Payment not found.");
  if (message.includes("APPLICATION_NOT_FOUND")) return fail("Application not found.");
  if (message.includes("PAYMENT_EVENT_MISMATCH")) {
    return fail("This payment no longer belongs to the selected event. Refresh and try again.");
  }
  if (message.includes("PAYMENT_AMOUNT_MISMATCH")) {
    return fail("The payment amount no longer matches the application total. Review the booking before confirming.");
  }
  if (message.includes("INVALID_REFUND_AMOUNT")) {
    return fail("The refund must be greater than zero and cannot exceed the recorded payment amount.");
  }
  if (message.includes("INVALID_DEADLINE_MINUTES")) return fail("Enter a valid whole-number deadline within the allowed range.");
  if (message.includes("INVALID_PAYMENT_LINK")) return fail("Enter a valid HTTPS payment link without embedded credentials.");
  if (message.includes("INVALID_PAYMENT_AMOUNT")) return fail("Enter a valid payment amount greater than zero.");
  if (message.includes("INVALID_REJECTION_REASON")) return fail("Enter a valid rejection reason under 2,000 characters.");
  if (message.includes("INVALID_PAYMENT_NOTES")) return fail("Keep payment notes under 5,000 characters.");
  if (message.includes("PAYMENT_STATE_CONFLICT")) {
    return fail("This payment changed while you were reviewing it. Refresh before trying again.");
  }
  if (message.includes("APPLICATION_STATE_CONFLICT") || message.includes("PAYMENT_BOOTH_INVALID") || message.includes("BOOTH_LOCK_EXPIRED")) {
    return fail("The application or booth changed while you were reviewing it. Refresh before trying again.");
  }
  return fail(fallback);
}

export async function confirmPaymentAction(paymentId: string, eventId: string): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: result, error } = await supabase.rpc("admin_confirm_payment", {
    p_payment_id: paymentId,
    p_event_id: eventId,
  });
  if (error || !result) return paymentMutationError(error, "Could not confirm this payment.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "payment.confirmed",
    entityType: "payment",
    entityId: paymentId,
    previousValue: { status: result.previous_status },
    newValue: { status: result.status, amount: result.amount },
  });

  await sendNotification(supabase, { businessId: result.business_id, templateKey: "payment_approved" });

  revalidatePath(`/admin/events/${eventId}/payments`);
  revalidatePath(`/admin/events/${eventId}/applications`);
  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true };
}

export async function rejectReceiptAction(paymentId: string, eventId: string, reason: string): Promise<ActionResult> {
  const normalizedReason = reason.trim();
  if (!normalizedReason) return fail("A reason is required.");
  if (normalizedReason.length > MAX_REASON_LENGTH) {
    return fail("Keep the rejection reason under 2,000 characters.");
  }
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: result, error } = await supabase.rpc("admin_reject_payment", {
    p_payment_id: paymentId,
    p_event_id: eventId,
    p_reason: normalizedReason,
  });
  if (error || !result) return paymentMutationError(error, "Could not reject this payment submission.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "payment.rejected",
    entityType: "payment",
    entityId: paymentId,
    previousValue: { status: result.previous_status },
    newValue: { status: result.status, reason: normalizedReason, deadline_at: result.deadline_at },
  });

  await sendNotification(supabase, {
    businessId: result.business_id,
    templateKey: "payment_rejected",
    variables: { reason: normalizedReason },
  });

  revalidatePath(`/admin/events/${eventId}/payments`);
  revalidatePath(`/admin/events/${eventId}/applications`);
  return { ok: true };
}

export async function extendPaymentDeadlineAction(paymentId: string, eventId: string, extraMinutes: number): Promise<ActionResult> {
  if (!validWholeMinutes(extraMinutes, 1)) {
    return fail("Enter a whole number of minutes between 1 and 10,080.");
  }
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: result, error } = await supabase.rpc("admin_extend_payment_deadline", {
    p_payment_id: paymentId,
    p_event_id: eventId,
    p_extra_minutes: extraMinutes,
  });
  if (error || !result) return paymentMutationError(error, "Could not extend the deadline.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "payment.deadline_extended",
    entityType: "payment",
    entityId: paymentId,
    previousValue: { status: result.previous_status },
    newValue: { status: result.status, deadline_at: result.deadline_at },
  });

  revalidatePath(`/admin/events/${eventId}/payments`);
  return { ok: true };
}

export async function reopenPaymentAction(paymentId: string, eventId: string, deadlineMinutes: number): Promise<ActionResult> {
  if (!validWholeMinutes(deadlineMinutes, 5)) {
    return fail("Enter a whole number of minutes between 5 and 10,080.");
  }
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: result, error } = await supabase.rpc("admin_reopen_payment", {
    p_payment_id: paymentId,
    p_event_id: eventId,
    p_deadline_minutes: deadlineMinutes,
  });
  if (error || !result) return paymentMutationError(error, "Could not reopen this payment.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "payment.reopened",
    entityType: "payment",
    entityId: paymentId,
    previousValue: { status: result.previous_status },
    newValue: { status: result.status, deadline_at: result.deadline_at },
    metadata: { application_id: result.application_id, booth_id: result.booth_id },
  });

  revalidatePath(`/admin/events/${eventId}/payments`);
  revalidatePath(`/admin/events/${eventId}/applications`);
  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true };
}

export async function markRefundAction(
  paymentId: string,
  eventId: string,
  refundAmount: number,
  notes: string
): Promise<ActionResult> {
  const normalizedAmount = normalizedMoney(refundAmount);
  if (normalizedAmount === null) return fail("Enter a valid refund amount greater than zero.");
  const normalizedNotes = notes.trim();
  if (normalizedNotes.length > MAX_NOTES_LENGTH) {
    return fail("Keep payment notes under 5,000 characters.");
  }
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: result, error } = await supabase.rpc("admin_refund_payment", {
    p_payment_id: paymentId,
    p_event_id: eventId,
    p_refund_amount: normalizedAmount,
    p_notes: normalizedNotes || null,
  });
  if (error || !result) return paymentMutationError(error, "Could not record the refund.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "payment.refunded",
    entityType: "payment",
    entityId: paymentId,
    previousValue: { status: result.previous_status },
    newValue: { status: result.status, refund_amount: result.refund_amount, full: result.full_refund },
  });

  revalidatePath(`/admin/events/${eventId}/payments`);
  return { ok: true };
}

export async function addPaymentNoteAction(paymentId: string, eventId: string, notes: string): Promise<ActionResult> {
  const normalizedNotes = notes.trim();
  if (normalizedNotes.length > MAX_NOTES_LENGTH) {
    return fail("Keep payment notes under 5,000 characters.");
  }
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: result, error } = await supabase.rpc("admin_update_payment_note", {
    p_payment_id: paymentId,
    p_event_id: eventId,
    p_notes: normalizedNotes,
  });
  if (error || !result) return paymentMutationError(error, "Could not save the note.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "payment.note_added",
    entityType: "payment",
    entityId: paymentId,
    previousValue: { status: result.previous_status },
    newValue: { status: result.status, has_note: Boolean(normalizedNotes) },
  });

  revalidatePath(`/admin/events/${eventId}/payments`);
  return { ok: true };
}

export async function attachPaymentLinkAction(paymentId: string, eventId: string, link: string): Promise<ActionResult> {
  const normalizedLink = normalizeHttpsPaymentLink(link);
  if (normalizedLink === undefined) {
    return fail("Enter a valid HTTPS payment link without embedded credentials.");
  }
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: result, error } = await supabase.rpc("admin_update_payment_link", {
    p_payment_id: paymentId,
    p_event_id: eventId,
    p_payment_link: normalizedLink ?? "",
  });
  if (error || !result) return paymentMutationError(error, "Could not attach the payment link.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "payment.link_attached",
    entityType: "payment",
    entityId: paymentId,
    previousValue: { status: result.previous_status },
    newValue: { status: result.status, has_payment_link: Boolean(normalizedLink) },
  });

  revalidatePath(`/admin/events/${eventId}/payments`);
  return { ok: true };
}

export async function releasePaymentBoothAction(paymentId: string, eventId: string): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: result, error } = await supabase.rpc("admin_release_payment_booth", {
    p_payment_id: paymentId,
    p_event_id: eventId,
  });
  if (error || !result) return paymentMutationError(error, "Could not release this payment's booth.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "payment.booth_released",
    entityType: "payment",
    entityId: paymentId,
    previousValue: { status: result.previous_status },
    newValue: { status: result.status, booth_id: null },
    metadata: { released_booth_id: result.booth_id },
  });

  revalidatePath(`/admin/events/${eventId}/payments`);
  revalidatePath(`/admin/events/${eventId}/booths`);
  revalidatePath(`/admin/events/${eventId}/applications`);
  return { ok: true };
}

export async function recordOfflinePaymentAction(
  applicationId: string,
  eventId: string,
  amount: number,
  notes: string
): Promise<ActionResult> {
  const normalizedAmount = normalizedMoney(amount);
  if (normalizedAmount === null) return fail("Enter a valid payment amount greater than zero.");
  const normalizedNotes = notes.trim();
  if (normalizedNotes.length > MAX_NOTES_LENGTH) {
    return fail("Keep payment notes under 5,000 characters.");
  }
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: result, error } = await supabase.rpc("admin_record_offline_payment", {
    p_application_id: applicationId,
    p_event_id: eventId,
    p_amount: normalizedAmount,
    p_notes: normalizedNotes || null,
  });
  if (error || !result) return paymentMutationError(error, "Could not record this payment.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "payment.offline_recorded",
    entityType: "payment",
    entityId: result.payment_id,
    previousValue: { status: result.previous_status },
    newValue: { status: result.status, amount: result.amount, method: "offline" },
    metadata: { application_id: applicationId, booth_id: result.booth_id },
  });

  revalidatePath(`/admin/events/${eventId}/payments`);
  revalidatePath(`/admin/events/${eventId}/applications`);
  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true };
}

export async function sweepExpiredPaymentsAction(eventId: string): Promise<ActionResult & { count?: number }> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("expire_overdue_payments", { p_event_id: eventId });
  if (error) return fail("Could not sweep expired payments.");
  revalidatePath(`/admin/events/${eventId}/payments`);
  return { ok: true, count: data ?? 0 };
}
