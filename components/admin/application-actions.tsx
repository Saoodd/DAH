"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { approveApplicationAction, rejectApplicationAction } from "@/app/admin/applications/actions";
import { recordOfflinePaymentAction } from "@/app/admin/events/[id]/payments/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

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
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)}>
            Reject
          </Button>
        </>
      )}
      {canRecordOffline && (
        <Button size="sm" variant="outline" onClick={() => setOfflineOpen(true)}>
          Record payment
        </Button>
      )}

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Reject this application"
        description="The vendor will see this reason on their dashboard."
        confirmLabel="Reject"
        loading={isPending}
        onConfirm={reject}
      >
        <Textarea autoFocus rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason…" />
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
        <div className="space-y-3">
          <Input type="number" min={0.01} max={99999999.99} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} placeholder="Amount (AED)" />
          <Textarea rows={2} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
        </div>
      </ConfirmDialog>
    </div>
  );
}
