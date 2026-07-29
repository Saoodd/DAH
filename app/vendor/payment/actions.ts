"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireVendor } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import { sendTrustedNotification } from "@/lib/notifications";
import { removeSupersededOwnedFile, uploadOwnedFile } from "@/lib/storage";
import { bankTransferSchema, adcbReferenceSchema, MAX_RECEIPT_SIZE_BYTES, ACCEPTED_RECEIPT_TYPES } from "@/lib/validations/payment";
import type { ActionResult } from "@/app/auth/actions";

function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult {
  return { ok: false, error, fieldErrors };
}

async function getOwnPayment(paymentId: string, businessId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: payment } = await supabase
    .from("payments")
    .select("*, applications(business_id)")
    .eq("id", paymentId)
    .maybeSingle();
  const application = payment?.applications as unknown as { business_id: string } | null;
  if (!payment || application?.business_id !== businessId) return null;
  return payment;
}

export async function submitAdcbReferenceAction(paymentId: string, formData: FormData): Promise<ActionResult> {
  const { authUser } = await requireVendor();
  const supabase = await createClient();

  const { data: business } = await supabase.from("businesses").select("id").eq("owner_id", authUser.id).maybeSingle();
  if (!business) return fail("Business not found.");

  const payment = await getOwnPayment(paymentId, business.id, supabase);
  if (!payment) return fail("Payment not found.");
  if (!["payment_required", "pending_payment"].includes(payment.status)) {
    return fail("This payment can no longer be updated.");
  }

  const parsed = adcbReferenceSchema.safeParse({ paymentReference: String(formData.get("paymentReference") ?? "") });
  if (!parsed.success) return fail("Enter a valid payment reference.", parsed.error.flatten().fieldErrors);

  // Vendors have no direct UPDATE grant on payments (migration 0008) — this
  // narrow SECURITY DEFINER function re-validates ownership and status
  // server-side before writing, so a vendor can never mark their own
  // payment "paid" by calling the table API directly.
  const { error } = await supabase.rpc("submit_adcb_payment_reference", {
    p_payment_id: paymentId,
    p_reference: parsed.data.paymentReference,
  });
  if (error) return fail("Could not save your payment reference.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "vendor",
    action: "payment.reference_submitted",
    entityType: "payment",
    entityId: paymentId,
    newValue: { method: "adcb_pace_pay", reference: parsed.data.paymentReference },
  });

  revalidatePath("/vendor/payment");
  revalidatePath("/vendor");
  return { ok: true };
}

export async function submitBankTransferReceiptAction(paymentId: string, formData: FormData): Promise<ActionResult> {
  const { authUser } = await requireVendor();
  const supabase = await createClient();

  const { data: business } = await supabase.from("businesses").select("id").eq("owner_id", authUser.id).maybeSingle();
  if (!business) return fail("Business not found.");

  const payment = await getOwnPayment(paymentId, business.id, supabase);
  if (!payment) return fail("Payment not found.");
  if (!["payment_required", "pending_payment", "receipt_uploaded"].includes(payment.status)) {
    return fail("This payment can no longer be updated.");
  }

  const parsed = bankTransferSchema.safeParse({
    transferReference: String(formData.get("transferReference") ?? ""),
    transferDate: String(formData.get("transferDate") ?? ""),
  });
  if (!parsed.success) return fail("Please fix the highlighted fields.", parsed.error.flatten().fieldErrors);

  const receipt = formData.get("receipt");
  if (!(receipt instanceof File) || receipt.size === 0) {
    return fail("Upload your transfer receipt.", { receipt: ["A receipt file is required."] });
  }
  if (receipt.size > MAX_RECEIPT_SIZE_BYTES) return fail("Receipt file is too large.", { receipt: ["Must be under 8MB."] });
  if (!ACCEPTED_RECEIPT_TYPES.includes(receipt.type)) {
    return fail("Unsupported file format.", { receipt: ["Use PNG, JPEG, WEBP, or PDF."] });
  }

  let path: string;
  try {
    path = await uploadOwnedFile(supabase, "payment-receipts", authUser.id, receipt);
  } catch {
    return fail("Could not upload your receipt. Please try again.");
  }

  const { error } = await supabase.rpc("submit_bank_transfer_receipt", {
    p_payment_id: paymentId,
    p_receipt_path: path,
    p_transfer_reference: parsed.data.transferReference,
    p_transfer_date: parsed.data.transferDate,
  });
  if (error) {
    try {
      const { error: cleanupError } = await createAdminClient()
        .storage
        .from("payment-receipts")
        .remove([path]);
      if (cleanupError) {
        console.error("Payment receipt cleanup failed.", cleanupError.message);
      }

    } catch {
      console.error("Payment receipt cleanup failed.");
    }
    return fail("Could not save your receipt.");
  }

  if (payment.receipt_url) {
    try {
      await removeSupersededOwnedFile(
        createAdminClient(),
        "payment-receipts",
        payment.receipt_url,
        path,
        authUser.id
      );
    } catch {
      console.error("Superseded payment receipt cleanup failed.");
    }
  }

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "vendor",
    action: "payment.receipt_uploaded",
    entityType: "payment",
    entityId: paymentId,
    newValue: { method: "bank_transfer", transfer_reference: parsed.data.transferReference },
  });

  await sendTrustedNotification({ businessId: business.id, templateKey: "receipt_received" });

  revalidatePath("/vendor/payment");
  revalidatePath("/vendor");
  return { ok: true };
}
