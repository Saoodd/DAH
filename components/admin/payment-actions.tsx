"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  confirmPaymentAction,
  rejectReceiptAction,
  extendPaymentDeadlineAction,
  reopenPaymentAction,
  markRefundAction,
  addPaymentNoteAction,
  attachPaymentLinkAction,
  releasePaymentBoothAction,
} from "@/app/admin/events/[id]/payments/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatAED } from "@/lib/format";

type DialogKind = "reject" | "extend" | "reopen" | "refund" | "note" | "link" | "release" | null;

export function PaymentActions({
  paymentId,
  eventId,
  status,
  amount,
  paymentLink,
  notes,
  receiptUrl,
  hasReceipt,
}: {
  paymentId: string;
  eventId: string;
  status: string;
  amount: number | null;
  paymentLink: string | null;
  notes: string | null;
  receiptUrl: string | null;
  hasReceipt: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = React.useTransition();
  const [dialog, setDialog] = React.useState<DialogKind>(null);
  const [text, setText] = React.useState("");
  const [number, setNumber] = React.useState(0);
  const fieldId = React.useId();
  const secondaryFieldId = React.useId();

  function run(promise: Promise<{ ok: boolean; error?: string }>, message: string) {
    startTransition(async () => {
      const result = await promise;
      if (!result.ok) {
        toast({ title: "Action failed", description: result.error, variant: "error" });
        return;
      }
      toast({ title: message, variant: "success" });
      setDialog(null);
      setText("");
      router.refresh();
    });
  }

  const canManagePaymentLink = ["not_requested", "payment_required", "pending_payment", "failed", "expired"].includes(status);

  return (
    <div className="flex flex-wrap gap-2">
      {receiptUrl && (
        <a
          href={receiptUrl}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Icon name="document" size="sm" />
          View receipt
        </a>
      )}
      {hasReceipt && !receiptUrl && (
        <span className="inline-flex items-center gap-1 self-center text-xs font-medium text-red-700">
          <Icon name="warning" size="xs" />
          Receipt unavailable
        </span>
      )}
      {["pending_payment", "pending_verification"].includes(status) && (
        <Button size="sm" onClick={() => run(confirmPaymentAction(paymentId, eventId), "Payment confirmed.")} loading={isPending}>
          <Icon name="check" size="sm" />
          Confirm
        </Button>
      )}
      {["pending_payment", "pending_verification"].includes(status) && (
        <Button size="sm" variant="outline" onClick={() => setDialog("reject")}>
          Reject
        </Button>
      )}
      {["payment_required", "pending_payment"].includes(status) && (
        <Button size="sm" variant="outline" onClick={() => setDialog("extend")}>
          Extend
        </Button>
      )}
      {status === "expired" && (
        <Button size="sm" variant="outline" onClick={() => setDialog("reopen")}>
          Reopen
        </Button>
      )}
      {status === "paid" && (
        <Button size="sm" variant="outline" onClick={() => setDialog("refund")}>
          Refund
        </Button>
      )}
      {canManagePaymentLink && (
        <Button size="sm" variant="outline" onClick={() => { setText(paymentLink ?? ""); setDialog("link"); }}>
          {paymentLink ? "Edit link" : "Attach link"}
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => { setText(notes ?? ""); setDialog("note"); }}>
        Note
      </Button>
      {["payment_required", "pending_payment", "pending_verification"].includes(status) && (
        <Button size="sm" variant="danger" onClick={() => setDialog("release")}>
          Release booth
        </Button>
      )}

      <ConfirmDialog
        open={dialog === "reject"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Reject this submission"
        description="The vendor keeps their booth and can resubmit a corrected receipt."
        confirmLabel="Reject submission"
        confirmVariant="danger"
        loading={isPending}
        onConfirm={() => {
          if (!text.trim()) return toast({ title: "A reason is required", variant: "error" });
          run(rejectReceiptAction(paymentId, eventId, text), "Rejected — vendor can resubmit.");
        }}
      >
        <Field label="Reason" htmlFor={fieldId} required>
          <Textarea
            id={fieldId}
            autoFocus
            rows={3}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Amount on the receipt doesn't match the booth price"
          />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "extend"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Extend payment deadline"
        confirmLabel="Extend deadline"
        loading={isPending}
        onConfirm={() => run(extendPaymentDeadlineAction(paymentId, eventId, number || 30), "Deadline extended.")}
      >
        <Field
          label="Extra time (minutes)"
          htmlFor={fieldId}
          hint="Added on top of the current deadline. Defaults to 30 minutes."
        >
          <Input
            id={fieldId}
            type="number"
            min={1}
            max={10080}
            step={1}
            className="tabular-nums"
            placeholder="30"
            value={number || ""}
            onChange={(e) => setNumber(Number(e.target.value))}
          />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "reopen"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Reopen payment"
        description="Gives the vendor a fresh deadline. Requires their booth to still be assigned."
        confirmLabel="Reopen payment"
        loading={isPending}
        onConfirm={() => run(reopenPaymentAction(paymentId, eventId, number || 60), "Payment reopened.")}
      >
        <Field
          label="New deadline (minutes from now)"
          htmlFor={fieldId}
          hint="Defaults to 60 minutes."
        >
          <Input
            id={fieldId}
            type="number"
            min={5}
            max={10080}
            step={1}
            className="tabular-nums"
            placeholder="60"
            value={number || ""}
            onChange={(e) => setNumber(Number(e.target.value))}
          />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "refund"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Record a refund"
        description="The platform records a full refund automatically when the amount equals the payment total."
        confirmLabel="Save refund"
        confirmVariant="danger"
        loading={isPending}
        onConfirm={() => run(markRefundAction(paymentId, eventId, number, text), "Refund recorded.")}
      >
        <div className="space-y-4">
          <Field
            label="Refund amount (AED)"
            htmlFor={fieldId}
            hint={amount !== null ? `Payment total: ${formatAED(amount)}` : undefined}
            required
          >
            <Input
              id={fieldId}
              type="number"
              min={0.01}
              max={amount ?? 99999999.99}
              step="0.01"
              className="tabular-nums"
              placeholder="0.00"
              value={number || ""}
              onChange={(e) => setNumber(Number(e.target.value))}
            />
          </Field>
          <Field label="Notes (optional)" htmlFor={secondaryFieldId}>
            <Textarea
              id={secondaryFieldId}
              rows={2}
              maxLength={5000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Refunded via bank transfer on request"
            />
          </Field>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "note"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Internal payment note"
        description="Visible to admins only — the vendor never sees this."
        confirmLabel="Save note"
        loading={isPending}
        onConfirm={() => run(addPaymentNoteAction(paymentId, eventId, text), "Note saved.")}
      >
        <Field label="Note" htmlFor={fieldId}>
          <Textarea id={fieldId} autoFocus rows={3} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "link"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="ADCB Pace Pay link"
        description="Paste only a payment URL you verified in the provider portal. Saving a blank value removes the link."
        confirmLabel="Save link"
        loading={isPending}
        onConfirm={() => run(attachPaymentLinkAction(paymentId, eventId, text), "Payment link saved.")}
      >
        <Field label="Payment URL" htmlFor={fieldId}>
          <Input
            id={fieldId}
            autoFocus
            type="url"
            inputMode="url"
            maxLength={2048}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="https://…"
          />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "release"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Release this vendor's booth"
        description="Marks payment as expired and returns the booth to availability. The application is preserved."
        confirmLabel="Release booth"
        confirmVariant="danger"
        loading={isPending}
        onConfirm={() => run(releasePaymentBoothAction(paymentId, eventId), "Booth released.")}
      />
    </div>
  );
}
