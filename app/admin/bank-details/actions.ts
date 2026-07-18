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
  const iban = String(formData.get("iban") ?? "").trim();
  const swiftCode = String(formData.get("swiftCode") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const id = String(formData.get("id") ?? "");

  if (!bankName || !accountName || !iban) {
    return fail("Bank name, account name, and IBAN are required.");
  }

  const supabase = await createClient();
  const { error } = id
    ? await supabase
        .from("bank_details")
        .update({ bank_name: bankName, account_name: accountName, iban, swift_code: swiftCode || null, notes: notes || null })
        .eq("id", id)
    : await supabase.from("bank_details").insert({
        event_id: null,
        bank_name: bankName,
        account_name: accountName,
        iban,
        swift_code: swiftCode || null,
        notes: notes || null,
      });

  if (error) return fail("Could not save bank details.");

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: id ? "bank_details.updated" : "bank_details.created",
    entityType: "bank_details",
    entityId: id || null,
  });

  revalidatePath("/admin/bank-details");
  return { ok: true };
}

export async function deleteBankDetailsAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("bank_details").delete().eq("id", id);
  if (error) return fail("Could not delete these bank details.");
  revalidatePath("/admin/bank-details");
  return { ok: true };
}
