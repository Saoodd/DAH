"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { approveApplicationAction, rejectApplicationAction } from "@/app/admin/applications/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

export function ApplicationActions({ applicationId, status }: { applicationId: string; status: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = React.useTransition();
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");

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

  if (!["submitted", "under_review"].includes(status)) return null;

  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={approve} loading={isPending}>
        Approve
      </Button>
      <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)}>
        Reject
      </Button>

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Reject this application"
        description="The vendor will see this reason on their dashboard."
        confirmLabel="Reject"
        loading={isPending}
        onConfirm={reject}
      >
        <Textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason…" />
      </ConfirmDialog>
    </div>
  );
}
