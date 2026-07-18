import Link from "next/link";
import type { Metadata } from "next";
import { requireOwnedBusiness } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { getSignedFileUrl } from "@/lib/storage";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PaymentPanel } from "@/components/vendor/payment-panel";

export const metadata: Metadata = { title: "Payment" };
export const dynamic = "force-dynamic";

export default async function VendorPaymentPage() {
  const business = await requireOwnedBusiness();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name, payment_deadline_minutes")
    .eq("registration_status", "open")
    .maybeSingle();

  if (!event) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-ink-950">Payment</h1>
        <Alert variant="info">There is no open event right now.</Alert>
      </div>
    );
  }

  await supabase.rpc("expire_overdue_payments", { p_event_id: event.id });

  const { data: application } = await supabase
    .from("applications")
    .select("id, status, booth_id, total_amount, booth_price_before_vat, vat_amount")
    .eq("event_id", event.id)
    .eq("business_id", business.id)
    .maybeSingle();

  if (!application || !application.booth_id) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-ink-950">Payment</h1>
        <Alert variant="info">Select a booth before continuing to payment.</Alert>
        <Link href="/vendor/booths" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          Go to booth selection
        </Link>
      </div>
    );
  }

  const [{ data: booth }, { data: payment }, { data: eventBankDetails }, { data: globalBankDetails }] = await Promise.all([
    supabase.from("booths").select("booth_number, status").eq("id", application.booth_id).maybeSingle(),
    supabase.from("payments").select("*").eq("application_id", application.id).maybeSingle(),
    supabase.from("bank_details").select("*").eq("event_id", event.id).maybeSingle(),
    supabase.from("bank_details").select("*").is("event_id", null).maybeSingle(),
  ]);

  const bankDetails = eventBankDetails ?? globalBankDetails ?? null;

  if (!payment) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-ink-950">Payment</h1>
        <Alert variant="info">
          Payment hasn&rsquo;t been requested yet. Confirm your booth selection to continue.
        </Alert>
        <Link href="/vendor/booths" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          Back to booth selection
        </Link>
      </div>
    );
  }

  const receiptSignedUrl = payment.receipt_url
    ? await getSignedFileUrl(supabase, "payment-receipts", payment.receipt_url)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-950">Payment</h1>
        <p className="mt-1 text-sm text-ink-500">Booth {booth?.booth_number} · {event.name}</p>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <PaymentPanel
            payment={payment}
            boothNumber={booth?.booth_number ?? "—"}
            totalAmount={application.total_amount}
            boothPriceBeforeVat={application.booth_price_before_vat}
            vatAmount={application.vat_amount}
            bankDetails={bankDetails}
            receiptSignedUrl={receiptSignedUrl}
          />
        </CardContent>
      </Card>
    </div>
  );
}
