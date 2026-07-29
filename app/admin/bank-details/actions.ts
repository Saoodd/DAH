"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/app/auth/actions";

function fail(error: string): ActionResult {
  return { ok: false, error };
}

export async function upsertBankDetailsAction(formData: FormData): Promise<ActionResult> {
  const { authUser } = await requireAdmin();

  const bankName = String(formData.get("bankName") ?? "").trim();
  const accountName = String(formData.get("accountName") ?? "").trim();
  const iban = String(formData.get("iban") ?? "").replace(/\s+/g, "").toUpperCase();
  const swiftCode = String(formData.get("swiftCode") ?? "").replace(/\s+/g, "").toUpperCase();
  const notes = String(formData.get("notes") ?? "").trim();
  const id = String(formData.get("id") ?? "");

  if (!bankName || !accountName || !iban) {
    return fail("Bank name, account name, and IBAN are required.");
  }
  if (bankName.length > 100 || accountName.length > 150) {
    return fail("Keep the bank name under 100 characters and the account name under 150 characters.");
  }
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) {
    return fail("Enter a valid IBAN between 15 and 34 characters.");
  }
  if (swiftCode && !/^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(swiftCode)) {
    return fail("Enter a valid 8- or 11-character SWIFT/BIC code.");
  }
  if (notes.length > 1_000) return fail("Keep vendor notes under 1,000 characters.");

  const supabase = await createClient();
  const result = id
    ? await supabase
        .from("bank_details")
        .update({ bank_name: bankName, account_name: accountName, iban, swift_code: swiftCode || null, notes: notes || null })
        .eq("id", id)
        .is("event_id", null)
        .select("id")
        .maybeSingle()
    : await supabase.from("bank_details").insert({
        event_id: null,
        bank_name: bankName,
        account_name: accountName,
        iban,
        swift_code: swiftCode || null,
        notes: notes || null,
      }).select("id").single();

  if (result.error || !result.data) return fail("Could not save bank details.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: id ? "bank_details.updated" : "bank_details.created",
    entityType: "bank_details",
    entityId: result.data.id,
  });

  revalidatePath("/admin/bank-details");
  return { ok: true };
}

export async function deleteBankDetailsAction(id: string): Promise<ActionResult> {
  const { authUser } = await requireAdmin();
  const supabase = await createClient();
  const { data: deleted, error } = await supabase
    .from("bank_details")
    .delete()
    .eq("id", id)
    .is("event_id", null)
    .select("id")
    .maybeSingle();
  if (error) return fail("Could not delete these bank details.");
  if (!deleted) return fail("These bank details no longer exist. Refresh and try again.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "bank_details.deleted",
    entityType: "bank_details",
    entityId: id,
  });

  revalidatePath("/admin/bank-details");
  return { ok: true };
}
