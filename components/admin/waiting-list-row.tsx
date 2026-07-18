"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  reorderPriorityAction,
  addWaitingListNoteAction,
  removeFromWaitingListAction,
  inviteFromWaitingListAction,
} from "@/app/admin/events/[id]/waiting-list/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

interface AvailableBooth {
  id: string;
  booth_number: string;
}

export function WaitingListRow({
  entryId,
  eventId,
  status,
  notes,
  availableBooths,
}: {
  entryId: string;
  eventId: string;
  status: string;
  notes: string | null;
  availableBooths: AvailableBooth[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = React.useTransition();
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [noteText, setNoteText] = React.useState(notes ?? "");
  const [boothId, setBoothId] = React.useState(availableBooths[0]?.id ?? "");

  function run(promise: Promise<{ ok: boolean; error?: string }>, message?: string) {
    startTransition(async () => {
      const result = await promise;
      if (!result.ok) {
        toast({ title: "Action failed", description: result.error, variant: "error" });
        return;
      }
      if (message) toast({ title: message, variant: "success" });
      setNoteOpen(false);
      setInviteOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "waiting" && (
        <>
          <Button size="sm" variant="ghost" onClick={() => run(reorderPriorityAction(entryId, eventId, "up"))}>
            ↑
          </Button>
          <Button size="sm" variant="ghost" onClick={() => run(reorderPriorityAction(entryId, eventId, "down"))}>
            ↓
          </Button>
          <Button size="sm" onClick={() => setInviteOpen(true)} disabled={availableBooths.length === 0}>
            Invite
          </Button>
          <Button size="sm" variant="danger" onClick={() => run(removeFromWaitingListAction(entryId, eventId), "Removed.")}>
            Remove
          </Button>
        </>
      )}
      <Button size="sm" variant="outline" onClick={() => setNoteOpen(true)}>
        Note
      </Button>

      <ConfirmDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        title="Admin note"
        confirmLabel="Save"
        loading={isPending}
        onConfirm={() => run(addWaitingListNoteAction(entryId, eventId, noteText), "Note saved.")}
      >
        <Textarea autoFocus rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
      </ConfirmDialog>

      <ConfirmDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Invite this vendor"
        description="Holds the booth for 30 minutes. If they don't accept in time, it releases automatically."
        confirmLabel="Send invitation"
        loading={isPending}
        onConfirm={() => run(inviteFromWaitingListAction(entryId, eventId, boothId), "Invitation sent.")}
      >
        <Select value={boothId} onChange={(e) => setBoothId(e.target.value)}>
          {availableBooths.map((b) => (
            <option key={b.id} value={b.id}>
              Booth {b.booth_number}
            </option>
          ))}
        </Select>
      </ConfirmDialog>
    </div>
  );
}
