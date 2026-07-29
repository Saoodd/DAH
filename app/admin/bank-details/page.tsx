import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { BankDetailsForm } from "@/components/admin/bank-details-form";

export const metadata: Metadata = { title: "Bank Details" };

export default async function AdminBankDetailsPage() {
  const supabase = await createClient();
  const { data: bankDetails, error } = await supabase.from("bank_details").select("*").is("event_id", null).maybeSingle();
  if (error) throw new Error("Could not load bank-transfer details.");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-950">Bank details</h1>
        <p className="mt-1 text-sm text-ink-500">
          Shown to vendors choosing bank transfer as their payment method.
        </p>
      </div>

      <BankDetailsForm existing={bankDetails ?? null} />
    </div>
  );
}
