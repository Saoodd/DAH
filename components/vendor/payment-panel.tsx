"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { submitAdcbReferenceAction, submitBankTransferReceiptAction } from "@/app/vendor/payment/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FileInput } from "@/components/ui/file-input";
import { useToast } from "@/components/ui/toast";
import { PAYMENT_STATUS_LABELS } from "@/lib/constants";
import { formatAED, formatDate } from "@/lib/format";
import type { Database } from "@/types/database";

type Payment = Database["public"]["Tables"]["payments"]["Row"];
type BankDetails = Database["public"]["Tables"]["bank_details"]["Row"];

function msRemaining(deadline: string | null) {
  return deadline ? Math.max(0, new Date(deadline).getTime() - Date.now()) : null;
}

function useCountdown(deadline: string | null) {
  const [prevDeadline, setPrevDeadline] = React.useState(deadline);
  const [remainingMs, setRemainingMs] = React.useState(() => msRemaining(deadline));

  if (deadline !== prevDeadline) {
    setPrevDeadline(deadline);
    setRemainingMs(msRemaining(deadline));
  }

  React.useEffect(() => {
    if (!deadline) return;
    const interval = setInterval(() => setRemainingMs(msRemaining(deadline)), 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  return remainingMs;
}

interface PaymentPanelProps {
  payment: Payment;
  boothNumber: string;
  totalAmount: number | null;
  boothPriceBeforeVat: number | null;
  vatAmount: number | null;
  bankDetails: BankDetails | null;
  receiptSignedUrl: string | null;
}

export function PaymentPanel({
  payment,
  boothNumber,
  totalAmount,
  boothPriceBeforeVat,
  vatAmount,
  bankDetails,
  receiptSignedUrl,
}: PaymentPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = React.useTransition();
  const [method, setMethod] = React.useState<"adcb_pace_pay" | "bank_transfer" | null>(null);
  const remainingMs = useCountdown(["payment_required", "pending_payment"].includes(payment.status) ? payment.deadline_at : null);

  React.useEffect(() => {
    if (remainingMs === 0) router.refresh();
  }, [remainingMs, router]);

  function onSubmitAdcb(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await submitAdcbReferenceAction(payment.id, formData);
      if (!result.ok) {
        toast({ title: "Couldn't save reference", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Payment reference submitted", description: "We'll verify and confirm shortly.", variant: "success" });
      router.refresh();
    });
  }

  function onSubmitBankTransfer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await submitBankTransferReceiptAction(payment.id, formData);
      if (!result.ok) {
        toast({ title: "Couldn't submit receipt", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Receipt submitted", description: "Pending verification by Dar Al Hay.", variant: "success" });
      router.refresh();
    });
  }

  const minutes = remainingMs !== null ? Math.floor(remainingMs / 60000) : null;
  const seconds = remainingMs !== null ? Math.floor((remainingMs % 60000) / 1000) : null;

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-ink-500">Booth {boothNumber}</p>
          <p className="text-2xl font-semibold text-ink-950">{formatAED(totalAmount)}</p>
          <p className="text-xs text-ink-400">
            {formatAED(boothPriceBeforeVat)} + {formatAED(vatAmount)} VAT
          </p>
        </div>
        <Badge className="border-ink-200 bg-ink-50 text-ink-700 print:hidden">{PAYMENT_STATUS_LABELS[payment.status]}</Badge>
      </div>

      {["payment_required", "pending_payment"].includes(payment.status) && remainingMs !== null && (
        <Alert variant={remainingMs < 5 * 60_000 ? "warning" : "info"} title={`${minutes}:${String(seconds).padStart(2, "0")} remaining`}>
          Complete payment before the countdown ends, or your booth will be released automatically.
        </Alert>
      )}

      {payment.status === "expired" && (
        <Alert variant="error" title="Payment window expired">
          Your booth was released back to availability. Your application is still active — select another booth to
          continue.
        </Alert>
      )}

      {payment.status === "pending_verification" && (
        <Alert variant="info" title="Receipt under review">
          Saeed or Omar will verify your transfer shortly. Reference: {payment.transfer_reference}
        </Alert>
      )}

      {payment.status === "pending_payment" && payment.method === "adcb_pace_pay" && (
        <Alert variant="info" title="Payment reference submitted">
          Reference: {payment.payment_reference}. We&rsquo;ll confirm once verified.
        </Alert>
      )}

      {payment.rejection_reason && ["payment_required"].includes(payment.status) && (
        <Alert variant="error" title="Previous submission rejected">
          {payment.rejection_reason} — please try again below.
        </Alert>
      )}

      {payment.status === "paid" && (
        <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center print:border-0 print:bg-white">
          <p className="text-lg font-semibold text-emerald-900">Payment confirmed</p>
          <p className="text-sm text-emerald-700">
            Verified {formatDate(payment.verified_at)}
            {payment.transfer_reference ? ` · Ref ${payment.transfer_reference}` : ""}
            {payment.payment_reference ? ` · Ref ${payment.payment_reference}` : ""}
          </p>
          <Button variant="outline" className="print:hidden" onClick={() => window.print()}>
            Print / save confirmation
          </Button>
        </div>
      )}

      {["payment_required", "pending_payment"].includes(payment.status) && (
        <div className="grid gap-4 sm:grid-cols-2 print:hidden">
          <button
            type="button"
            onClick={() => setMethod("adcb_pace_pay")}
            className={`rounded-xl border p-4 text-left ${method === "adcb_pace_pay" ? "border-ink-900 ring-1 ring-ink-900" : "border-ink-200"}`}
          >
            <p className="font-semibold text-ink-900">ADCB Pace Pay</p>
            <p className="mt-1 text-xs text-ink-500">Pay by card via the link Dar Al Hay sends you.</p>
          </button>
          <button
            type="button"
            onClick={() => setMethod("bank_transfer")}
            className={`rounded-xl border p-4 text-left ${method === "bank_transfer" ? "border-ink-900 ring-1 ring-ink-900" : "border-ink-200"}`}
          >
            <p className="font-semibold text-ink-900">Bank transfer (IBAN)</p>
            <p className="mt-1 text-xs text-ink-500">Transfer directly and upload your receipt.</p>
          </button>
        </div>
      )}

      {method === "adcb_pace_pay" && ["payment_required", "pending_payment"].includes(payment.status) && (
        <div className="space-y-4 rounded-xl border border-ink-100 p-4 print:hidden">
          {payment.payment_link ? (
            <a href={payment.payment_link} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center rounded-xl bg-ink-900 px-4 text-sm font-medium text-white hover:bg-ink-800">
              Pay via ADCB Pace Pay
            </a>
          ) : (
            <Alert variant="warning">
              Your ADCB Pace Pay link hasn&rsquo;t been generated yet. Dar Al Hay will send it to you — check back
              soon, or use bank transfer instead.
            </Alert>
          )}
          <form onSubmit={onSubmitAdcb} className="space-y-3">
            <Field label="Payment reference" htmlFor="paymentReference" hint="Enter the reference after paying, so we can verify it.">
              <Input id="paymentReference" name="paymentReference" defaultValue={payment.payment_reference ?? ""} required />
            </Field>
            <Button type="submit" size="sm" loading={isPending}>
              Submit reference
            </Button>
          </form>
        </div>
      )}

      {method === "bank_transfer" && ["payment_required", "pending_payment"].includes(payment.status) && (
        <div className="space-y-4 rounded-xl border border-ink-100 p-4 print:hidden">
          {bankDetails ? (
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-ink-400">Bank</dt>
              <dd className="text-right text-ink-800">{bankDetails.bank_name}</dd>
              <dt className="text-ink-400">Account name</dt>
              <dd className="text-right text-ink-800">{bankDetails.account_name}</dd>
              <dt className="text-ink-400">IBAN</dt>
              <dd className="text-right font-mono text-ink-800">{bankDetails.iban}</dd>
              {bankDetails.swift_code && (
                <>
                  <dt className="text-ink-400">SWIFT</dt>
                  <dd className="text-right text-ink-800">{bankDetails.swift_code}</dd>
                </>
              )}
            </dl>
          ) : (
            <Alert variant="warning">Bank details haven&rsquo;t been configured yet — contact Dar Al Hay.</Alert>
          )}
          <form onSubmit={onSubmitBankTransfer} className="space-y-3" encType="multipart/form-data">
            <Field label="Transfer reference" htmlFor="transferReference" required>
              <Input id="transferReference" name="transferReference" required />
            </Field>
            <Field label="Transfer date" htmlFor="transferDate" required>
              <Input id="transferDate" name="transferDate" type="date" max={new Date().toISOString().slice(0, 10)} required />
            </Field>
            <Field label="Transfer receipt" htmlFor="receipt" required>
              <FileInput id="receipt" name="receipt" accept="image/png,image/jpeg,image/webp,application/pdf" />
            </Field>
            <Button type="submit" size="sm" loading={isPending}>
              Submit receipt
            </Button>
          </form>
        </div>
      )}

      {receiptSignedUrl && (
        <a href={receiptSignedUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-600 hover:text-brand-700 print:hidden">
          View submitted receipt
        </a>
      )}
    </div>
  );
}
