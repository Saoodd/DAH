"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { approveApplicationAction, rejectApplicationAction } from "@/app/admin/applications/actions";
import { recordOfflinePaymentAction } from "@/app/admin/events/[id]/payments/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatAED } from "@/lib/format";

export function ApplicationActions({
  applicationId,
  eventId,
  status,
  totalAmount,
}: {
  applicationId: string;
  eventId: string;
  status: string;
  totalAmount: number | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = React.useTransition();
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [offlineOpen, setOfflineOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [amount, setAmount] = React.useState(totalAmount ?? 0);
  const [notes, setNotes] = React.useState("");
  const reasonFieldId = React.useId();
  const amountFieldId = React.useId();
  const notesFieldId = React.useId();

  function approve() {
    startTransition(async () => {
      const result = await approveApplicationAction(applicationId);
      if (!result.ok) {
        toast({ title: "Couldn't approve", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Application approved", variant: "success" });
      router.refresh();
    });
  }

  function reject() {
    if (!reason.trim()) {
      toast({ title: "A reason is required", variant: "error" });
      return;
    }
    startTransition(async () => {
      const result = await rejectApplicationAction(applicationId, reason);
      if (!result.ok) {
        toast({ title: "Couldn't reject", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Application rejected", variant: "success" });
      setRejectOpen(false);
      setReason("");
      router.refresh();
    });
  }

  function recordOffline() {
    startTransition(async () => {
      const result = await recordOfflinePaymentAction(applicationId, eventId, amount, notes);
      if (!result.ok) {
        toast({ title: "Couldn't record payment", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Offline payment recorded", variant: "success" });
      setOfflineOpen(false);
      router.refresh();
    });
  }

  const canReview = ["submitted", "under_review"].includes(status);
  const canRecordOffline = ["booth_selected", "awaiting_payment", "payment_under_review"].includes(status);

  if (!canReview && !canRecordOffline) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {canReview && (
        <>
          <Button size="sm" onClick={approve} loading={isPending}>
            <Icon name="check" size="sm" />
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)}>
            Reject
          </Button>
        </>
      )}
      {canRecordOffline && (
        <Button size="sm" variant="outline" onClick={() => setOfflineOpen(true)}>
          <Icon name="banknotes" size="sm" />
          Record payment
        </Button>
      )}

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Reject this application"
        description="The vendor will see this reason on their dashboard."
        confirmLabel="Reject application"
        confirmVariant="danger"
        loading={isPending}
        onConfirm={reject}
      >
        <Field label="Reason" htmlFor={reasonFieldId} required>
          <Textarea
            id={reasonFieldId}
            autoFocus
            rows={3}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this application can't proceed…"
          />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={offlineOpen}
        onOpenChange={setOfflineOpen}
        title="Record an offline payment"
        description="Marks this booth as paid and confirmed without going through the vendor payment flow."
        confirmLabel="Record payment"
        loading={isPending}
        onConfirm={recordOffline}
      >
        <div className="space-y-4">
          <Field
            label="Amount (AED)"
            htmlFor={amountFieldId}
            hint={totalAmount !== null ? `Application total: ${formatAED(totalAmount)}` : undefined}
            required
          >
            <Input
              id={amountFieldId}
              type="number"
              min={0.01}
              max={99999999.99}
              step="0.01"
              className="tabular-nums"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              placeholder="0.00"
            />
          </Field>
          <Field label="Notes (optional)" htmlFor={notesFieldId}>
            <Textarea
              id={notesFieldId}
              rows={2}
              maxLength={5000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Paid in cash at the office"
            />
          </Field>
        </div>
      </ConfirmDialog>
    </div>
  );
}
