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
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
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
  const [removeOpen, setRemoveOpen] = React.useState(false);
  const [noteText, setNoteText] = React.useState(notes ?? "");
  const [boothId, setBoothId] = React.useState(availableBooths[0]?.id ?? "");
  const noteFieldId = React.useId();
  const boothFieldId = React.useId();
  const selectedBoothId = availableBooths.some((booth) => booth.id === boothId)
    ? boothId
    : (availableBooths[0]?.id ?? "");

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
      setRemoveOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "waiting" && (
        <>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Move vendor up in waiting-list priority"
            onClick={() => run(reorderPriorityAction(entryId, eventId, "up"))}
          >
            <Icon name="chevron-up" size="sm" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Move vendor down in waiting-list priority"
            onClick={() => run(reorderPriorityAction(entryId, eventId, "down"))}
          >
            <Icon name="chevron-down" size="sm" />
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setInviteOpen(true)}
            disabled={availableBooths.length === 0}
            title={availableBooths.length === 0 ? "No booths are currently available" : undefined}
          >
            Invite
          </Button>
          <Button type="button" size="sm" variant="danger" onClick={() => setRemoveOpen(true)}>
            Remove
          </Button>
        </>
      )}
      <Button type="button" size="sm" variant="outline" onClick={() => setNoteOpen(true)}>
        Note
      </Button>

      <ConfirmDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        title="Admin note"
        description="Visible to admins only — the vendor never sees this."
        confirmLabel="Save"
        loading={isPending}
        onConfirm={() => run(addWaitingListNoteAction(entryId, eventId, noteText), "Note saved.")}
      >
        <Field label="Note" htmlFor={noteFieldId}>
          <Textarea id={noteFieldId} rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Invite this vendor"
        description="Holds the booth for 30 minutes. If they don't accept in time, it releases automatically."
        confirmLabel="Send invitation"
        loading={isPending}
        onConfirm={() => run(inviteFromWaitingListAction(entryId, eventId, selectedBoothId), "Invitation sent.")}
      >
        <Field label="Booth" htmlFor={boothFieldId} required>
          <Select id={boothFieldId} value={selectedBoothId} onChange={(e) => setBoothId(e.target.value)}>
            {availableBooths.map((b) => (
              <option key={b.id} value={b.id}>
                Booth {b.booth_number}
              </option>
            ))}
          </Select>
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove this vendor from the waiting list?"
        description="They lose their place in the queue and won't receive booth invitations for this event."
        confirmLabel="Remove vendor"
        confirmVariant="danger"
        loading={isPending}
        onConfirm={() => run(removeFromWaitingListAction(entryId, eventId), "Removed.")}
      />
    </div>
  );
}
