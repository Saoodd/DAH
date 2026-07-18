"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/app/auth/actions";

function fail(error: string): ActionResult {
  return { ok: false, error };
}

export async function confirmPaymentAction(paymentId: string, eventId: string): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("id, status, application_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return fail("Payment not found.");

  const { data: application } = await supabase
    .from("applications")
    .select("id, booth_id, business_id")
    .eq("id", payment.application_id)
    .maybeSingle();
  if (!application) return fail("Application not found.");

  const { error } = await supabase
    .from("payments")
    .update({ status: "paid", verified_by: authUser.id, verified_at: new Date().toISOString(), rejection_reason: null })
    .eq("id", paymentId);
  if (error) return fail("Could not confirm this payment.");

  await supabase.from("applications").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", application.id);
  if (application.booth_id) {
    await supabase.from("booths").update({ status: "confirmed" }).eq("id", application.booth_id);
    await supabase
      .from("booth_events")
      .insert({ booth_id: application.booth_id, event_type: "confirmed", business_id: application.business_id, actor_id: authUser.id });
  }

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "payment.confirmed",
    entityType: "payment",
    entityId: paymentId,
    previousValue: { status: payment.status },
    newValue: { status: "paid" },
  });

  revalidatePath(`/admin/events/${eventId}/payments`);
  revalidatePath(`/admin/events/${eventId}/applications`);
  return { ok: true };
}

export async function rejectReceiptAction(paymentId: string, eventId: string, reason: string): Promise<ActionResult> {
  if (!reason.trim()) return fail("A reason is required.");
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: payment } = await supabase.from("payments").select("status").eq("id", paymentId).maybeSingle();
  if (!payment) return fail("Payment not found.");

  const { error } = await supabase
    .from("payments")
    .update({ status: "payment_required", rejection_reason: reason.trim() })
    .eq("id", paymentId);
  if (error) return fail("Could not reject this receipt.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "payment.rejected",
    entityType: "payment",
    entityId: paymentId,
    previousValue: { status: payment.status },
    newValue: { status: "payment_required", reason },
  });

  revalidatePath(`/admin/events/${eventId}/payments`);
  return { ok: true };
}

export async function extendPaymentDeadlineAction(paymentId: string, eventId: string, extraMinutes: number): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: payment } = await supabase.from("payments").select("deadline_at").eq("id", paymentId).maybeSingle();
  if (!payment) return fail("Payment not found.");

  const base = payment.deadline_at && new Date(payment.deadline_at) > new Date() ? new Date(payment.deadline_at) : new Date();
  const newDeadline = new Date(base.getTime() + extraMinutes * 60_000).toISOString();

  const { error } = await supabase.from("payments").update({ deadline_at: newDeadline }).eq("id", paymentId);
  if (error) return fail("Could not extend the deadline.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "payment.deadline_extended",
    entityType: "payment",
    entityId: paymentId,
    newValue: { deadline_at: newDeadline },
  });

  revalidatePath(`/admin/events/${eventId}/payments`);
  return { ok: true };
}

export async function reopenPaymentAction(paymentId: string, eventId: string, deadlineMinutes: number): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("id, status, application_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return fail("Payment not found.");

  const { data: application } = await supabase
    .from("applications")
    .select("booth_id")
    .eq("id", payment.application_id)
    .maybeSingle();
  if (!application?.booth_id) {
    return fail("This application no longer has a booth — reassign a booth first from the booth map.");
  }

  const { error } = await supabase
    .from("payments")
    .update({
      status: "payment_required",
      rejection_reason: null,
      deadline_at: new Date(Date.now() + deadlineMinutes * 60_000).toISOString(),
    })
    .eq("id", paymentId);
  if (error) return fail("Could not reopen this payment.");

  await supabase.from("applications").update({ status: "awaiting_payment" }).eq("id", payment.application_id);
  await supabase.from("booths").update({ status: "awaiting_payment" }).eq("id", application.booth_id);

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "payment.reopened",
    entityType: "payment",
    entityId: paymentId,
    previousValue: { status: payment.status },
    newValue: { status: "payment_required" },
  });

  revalidatePath(`/admin/events/${eventId}/payments`);
  return { ok: true };
}

export async function markRefundAction(
  paymentId: string,
  eventId: string,
  refundAmount: number,
  full: boolean,
  notes: string
): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: payment } = await supabase.from("payments").select("status").eq("id", paymentId).maybeSingle();
  if (!payment || payment.status !== "paid") return fail("Only a paid payment can be refunded.");

  const { error } = await supabase
    .from("payments")
    .update({ status: full ? "refunded" : "partially_refunded", refund_amount: refundAmount, notes })
    .eq("id", paymentId);
  if (error) return fail("Could not record the refund.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "payment.refunded",
    entityType: "payment",
    entityId: paymentId,
    newValue: { refund_amount: refundAmount, full },
  });

  revalidatePath(`/admin/events/${eventId}/payments`);
  return { ok: true };
}

export async function addPaymentNoteAction(paymentId: string, eventId: string, notes: string): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("payments").update({ notes }).eq("id", paymentId);
  if (error) return fail("Could not save the note.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "payment.note_added",
    entityType: "payment",
    entityId: paymentId,
  });

  revalidatePath(`/admin/events/${eventId}/payments`);
  return { ok: true };
}

export async function attachPaymentLinkAction(paymentId: string, eventId: string, link: string): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("payments").update({ payment_link: link, method: "adcb_pace_pay" }).eq("id", paymentId);
  if (error) return fail("Could not attach the payment link.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "payment.link_attached",
    entityType: "payment",
    entityId: paymentId,
  });

  revalidatePath(`/admin/events/${eventId}/payments`);
  return { ok: true };
}

export async function releasePaymentBoothAction(paymentId: string, eventId: string): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("id, status, application_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return fail("Payment not found.");

  const { data: application } = await supabase
    .from("applications")
    .select("id, booth_id, business_id")
    .eq("id", payment.application_id)
    .maybeSingle();

  if (application?.booth_id) {
    await supabase
      .from("booths")
      .update({ status: "available", locked_by_business_id: null, lock_expires_at: null, current_application_id: null })
      .eq("id", application.booth_id);
    await supabase
      .from("booth_events")
      .insert({ booth_id: application.booth_id, event_type: "admin_released", business_id: application.business_id, actor_id: authUser.id });
  }

  await supabase
    .from("applications")
    .update({ booth_id: null, booth_price_before_vat: null, vat_amount: null, total_amount: null, status: "approved" })
    .eq("id", payment.application_id);

  await supabase.from("payments").update({ status: "expired" }).eq("id", paymentId);

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "payment.booth_released",
    entityType: "payment",
    entityId: paymentId,
  });

  revalidatePath(`/admin/events/${eventId}/payments`);
  revalidatePath(`/admin/events/${eventId}/booths`);
  return { ok: true };
}

export async function recordOfflinePaymentAction(
  applicationId: string,
  eventId: string,
  amount: number,
  notes: string
): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();

  const { data: application } = await supabase
    .from("applications")
    .select("id, booth_id, business_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!application) return fail("Application not found.");

  const { error } = await supabase.from("payments").upsert(
    {
      application_id: applicationId,
      method: "offline",
      status: "paid",
      amount,
      notes,
      verified_by: authUser.id,
      verified_at: new Date().toISOString(),
    },
    { onConflict: "application_id" }
  );
  if (error) return fail("Could not record this payment.");

  await supabase.from("applications").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", applicationId);
  if (application.booth_id) {
    await supabase.from("booths").update({ status: "confirmed" }).eq("id", application.booth_id);
  }

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "payment.offline_recorded",
    entityType: "payment",
    entityId: applicationId,
    newValue: { amount },
  });

  revalidatePath(`/admin/events/${eventId}/payments`);
  revalidatePath(`/admin/events/${eventId}/applications`);
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
