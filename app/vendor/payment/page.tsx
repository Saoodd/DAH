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

  // Payment access follows the vendor's application, not the registration
  // window. Vendors must still be able to pay or retrieve a confirmation after
  // registration closes.

  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false });

  if (paymentsError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-ink-950">Payment</h1>
        <Alert variant="error" title="Could not load payment">
          Please refresh the page. If the problem continues, contact Dar Al Hay.
        </Alert>
      </div>
    );
  }

  const actionableStatuses = new Set([
    "payment_required",
    "pending_payment",
    "receipt_uploaded",
    "pending_verification",
    "failed",
  ]);
  const paymentCandidate = payments?.find((item) => actionableStatuses.has(item.status)) ?? payments?.[0] ?? null;

  if (!paymentCandidate) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-ink-950">Payment</h1>
        <Alert variant="info" title="No payment requested">
          Your payment details will appear here after you confirm a booth.
        </Alert>
        <Link href="/vendor" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const { data: applicationCandidate, error: applicationCandidateError } = await supabase
    .from("applications")
    .select("id, event_id, status, booth_id, total_amount, booth_price_before_vat, vat_amount")
    .eq("id", paymentCandidate.application_id)
    .eq("business_id", business.id)
    .maybeSingle();

  if (applicationCandidateError || !applicationCandidate) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-ink-950">Payment</h1>
        <Alert variant="error" title="Could not load payment">
          The application linked to this payment is unavailable. Please contact Dar Al Hay.
        </Alert>
      </div>
    );
  }

  const { error: sweepError } = await supabase.rpc("expire_overdue_payments", {
    p_event_id: applicationCandidate.event_id,
  });

  if (sweepError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-ink-950">Payment</h1>
        <Alert variant="error" title="Could not refresh payment status">
          Please refresh the page before continuing with payment.
        </Alert>
      </div>
    );
  }

  const [paymentResult, applicationResult] = await Promise.all([
    supabase.from("payments").select("*").eq("id", paymentCandidate.id).maybeSingle(),
    supabase
      .from("applications")
      .select("id, event_id, status, booth_id, total_amount, booth_price_before_vat, vat_amount")
      .eq("id", applicationCandidate.id)
      .eq("business_id", business.id)
      .maybeSingle(),
  ]);

  if (paymentResult.error || applicationResult.error || !paymentResult.data || !applicationResult.data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-ink-950">Payment</h1>
        <Alert variant="error" title="Could not refresh payment status">
          Please refresh the page. If the problem continues, contact Dar Al Hay.
        </Alert>
      </div>
    );
  }

  const payment = paymentResult.data;
  const application = applicationResult.data;

  const [eventResult, boothResult, eventBankResult, globalBankResult] = await Promise.all([
    supabase.from("events").select("id, name").eq("id", application.event_id).maybeSingle(),
    application.booth_id
      ? supabase.from("booths").select("booth_number, status").eq("id", application.booth_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("bank_details").select("*").eq("event_id", application.event_id).maybeSingle(),
    supabase.from("bank_details").select("*").is("event_id", null).maybeSingle(),
  ]);

  if (eventResult.error || !eventResult.data || boothResult.error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-ink-950">Payment</h1>
        <Alert variant="error" title="Could not load payment details">
          Please refresh the page. If the problem continues, contact Dar Al Hay.
        </Alert>
      </div>
    );
  }

  const event = eventResult.data;
  const booth = boothResult.data;
  const bankDetails = eventBankResult.data ?? globalBankResult.data ?? null;

  const receiptSignedUrl = payment.receipt_url
    ? await getSignedFileUrl(supabase, "payment-receipts", payment.receipt_url)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-950">Payment</h1>
        <p className="mt-1 text-sm text-ink-500">
          {booth ? `Booth ${booth.booth_number}` : "Booth no longer assigned"} · {event.name}
        </p>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <PaymentPanel
            payment={payment}
            boothNumber={booth?.booth_number ?? "no longer assigned"}
            totalAmount={application.total_amount ?? payment.amount}
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
