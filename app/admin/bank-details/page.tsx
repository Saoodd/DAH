import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { BankDetailsForm } from "@/components/admin/bank-details-form";

export const metadata: Metadata = { title: "Bank Details" };

export default async function AdminBankDetailsPage() {
  const supabase = await createClient();
  const { data: bankDetails, error } = await supabase.from("bank_details").select("*").is("event_id", null).maybeSingle();
  if (error) throw new Error("Could not load bank-transfer details.");

  return (
    <div className="page-enter space-y-6">
      <div>
        <p className="text-caption font-semibold uppercase tracking-[0.14em] text-brand-700">Admin console</p>
        <h1 className="mt-2 font-display text-h2 text-ink-950 sm:text-h1">Bank details</h1>
        <p className="mt-2 text-sm text-ink-500">
          Shown to vendors choosing bank transfer as their payment method.
        </p>
      </div>

      <BankDetailsForm existing={bankDetails ?? null} />
    </div>
  );
}
