"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  approveBusinessAction,
  rejectBusinessAction,
  suspendBusinessAction,
  blacklistBusinessAction,
  reconsiderBusinessAction,
} from "@/app/admin/vendors/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import type { ApprovalStatus } from "@/types/database";

type ReasonAction = "reject" | "suspend" | "blacklist";

const REASON_DIALOG_COPY: Record<ReasonAction, { title: string; description: string; confirmLabel: string }> = {
  reject: {
    title: "Reject this vendor",
    description: "This reason is shown to the vendor on their dashboard.",
    confirmLabel: "Reject vendor",
  },
  suspend: {
    title: "Suspend this vendor",
    description: "The vendor loses access to event registration until reinstated.",
    confirmLabel: "Suspend vendor",
  },
  blacklist: {
    title: "Blacklist this vendor",
    description: "This is the most severe action — the vendor is permanently barred unless reconsidered.",
    confirmLabel: "Blacklist vendor",
  },
};

export function VendorActions({ businessId, status }: { businessId: string; status: ApprovalStatus }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = React.useTransition();
  const [reasonDialog, setReasonDialog] = React.useState<ReasonAction | null>(null);
  const [approveDialogOpen, setApproveDialogOpen] = React.useState(false);
  const [reconsiderDialogOpen, setReconsiderDialogOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");

  function runAction(promise: Promise<{ ok: boolean; error?: string }>, successMessage: string) {
    startTransition(async () => {
      const result = await promise;
      if (!result.ok) {
        toast({ title: "Action failed", description: result.error, variant: "error" });
        return;
      }
      toast({ title: successMessage, variant: "success" });
      setReasonDialog(null);
      setApproveDialogOpen(false);
      setReconsiderDialogOpen(false);
      setReason("");
      router.refresh();
    });
  }

  function submitReasonAction() {
    if (!reasonDialog) return;
    if (!reason.trim()) {
      toast({ title: "A reason is required", variant: "error" });
      return;
    }
    const action =
      reasonDialog === "reject"
        ? rejectBusinessAction
        : reasonDialog === "suspend"
          ? suspendBusinessAction
          : blacklistBusinessAction;
    runAction(action(businessId, reason), `Vendor ${reasonDialog === "reject" ? "rejected" : reasonDialog === "suspend" ? "suspended" : "blacklisted"}.`);
  }

  const canApprove = status !== "approved";
  const canReject = status === "pending_review";
  const canSuspend = status === "approved";
  const canBlacklist = status !== "blacklisted";
  const canReconsider = ["rejected", "suspended", "blacklisted"].includes(status);

  return (
    <div className="flex flex-wrap gap-2">
      {canApprove && (
        <Button size="sm" onClick={() => setApproveDialogOpen(true)} loading={isPending}>
          Approve
        </Button>
      )}
      {canReject && (
        <Button size="sm" variant="outline" onClick={() => setReasonDialog("reject")}>
          Reject
        </Button>
      )}
      {canSuspend && (
        <Button size="sm" variant="outline" onClick={() => setReasonDialog("suspend")}>
          Suspend
        </Button>
      )}
      {canBlacklist && (
        <Button size="sm" variant="danger" onClick={() => setReasonDialog("blacklist")}>
          Blacklist
        </Button>
      )}
      {canReconsider && (
        <Button size="sm" variant="outline" onClick={() => setReconsiderDialogOpen(true)}>
          Reconsider
        </Button>
      )}

      <ConfirmDialog
        open={approveDialogOpen}
        onOpenChange={setApproveDialogOpen}
        title="Approve this vendor"
        description="They'll be able to register for the open event and select a booth."
        confirmLabel="Approve vendor"
        loading={isPending}
        onConfirm={() => runAction(approveBusinessAction(businessId), "Vendor approved.")}
      />

      <ConfirmDialog
        open={reconsiderDialogOpen}
        onOpenChange={setReconsiderDialogOpen}
        title="Send back for review"
        description="This clears the previous decision and returns the vendor to Pending Review."
        confirmLabel="Send to review"
        loading={isPending}
        onConfirm={() => runAction(reconsiderBusinessAction(businessId), "Vendor sent back to review.")}
      />

      <ConfirmDialog
        open={reasonDialog !== null}
        onOpenChange={(open) => !open && setReasonDialog(null)}
        title={reasonDialog ? REASON_DIALOG_COPY[reasonDialog].title : ""}
        description={reasonDialog ? REASON_DIALOG_COPY[reasonDialog].description : ""}
        confirmLabel={reasonDialog ? REASON_DIALOG_COPY[reasonDialog].confirmLabel : "Confirm"}
        confirmVariant={reasonDialog === "reject" ? "outline" : "danger"}
        loading={isPending}
        onConfirm={submitReasonAction}
      >
        <Textarea
          autoFocus
          rows={3}
          placeholder="Explain why — the vendor will see this."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
}
