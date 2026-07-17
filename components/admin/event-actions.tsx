"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  openRegistrationAction,
  closeRegistrationAction,
  archiveEventAction,
  duplicateEventAction,
} from "@/app/admin/events/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { EventRegistrationStatus } from "@/types/database";

export function EventActions({
  eventId,
  status,
  compact = false,
}: {
  eventId: string;
  status: EventRegistrationStatus;
  compact?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = React.useTransition();
  const [openDialog, setOpenDialog] = React.useState(false);
  const [archiveDialog, setArchiveDialog] = React.useState(false);

  function run(promise: Promise<{ ok: boolean; error?: string }>, message: string) {
    startTransition(async () => {
      const result = await promise;
      if (!result.ok) {
        toast({ title: "Action failed", description: result.error, variant: "error" });
        return;
      }
      toast({ title: message, variant: "success" });
      setOpenDialog(false);
      setArchiveDialog(false);
      router.refresh();
    });
  }

  return (
    <div className={compact ? "flex flex-wrap gap-2" : "flex flex-wrap gap-2"}>
      {status !== "open" && status !== "archived" && (
        <Button size="sm" onClick={() => setOpenDialog(true)} loading={isPending}>
          Open registration
        </Button>
      )}
      {status === "open" && (
        <Button size="sm" variant="outline" onClick={() => run(closeRegistrationAction(eventId), "Registration closed.")}>
          Close registration
        </Button>
      )}
      {status !== "archived" && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => run(duplicateEventAction(eventId), "Event duplicated.")}
        >
          Duplicate
        </Button>
      )}
      {status !== "archived" && (
        <Button size="sm" variant="ghost" onClick={() => setArchiveDialog(true)}>
          Archive
        </Button>
      )}

      <ConfirmDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        title="Open registration"
        description="Only one event can be open at a time — if another event is currently open, close it first."
        confirmLabel="Open registration"
        loading={isPending}
        onConfirm={() => run(openRegistrationAction(eventId), "Registration opened.")}
      />

      <ConfirmDialog
        open={archiveDialog}
        onOpenChange={setArchiveDialog}
        title="Archive this event"
        description="Archived events are hidden from vendors but remain in event history."
        confirmLabel="Archive event"
        confirmVariant="danger"
        loading={isPending}
        onConfirm={() => run(archiveEventAction(eventId), "Event archived.")}
      />
    </div>
  );
}
