"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { updateChecklistAction, markSetupApprovedAction, markNeedsChangesAction } from "@/app/admin/events/[id]/setup/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileInput } from "@/components/ui/file-input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { Database } from "@/types/database";

type Checklist = Database["public"]["Tables"]["setup_checklists"]["Row"] | null;

const CHECKLIST_ITEMS: { key: keyof NonNullable<Checklist>; label: string }[] = [
  { key: "vendor_arrived", label: "Vendor arrived" },
  { key: "identity_confirmed", label: "Identity confirmed" },
  { key: "booth_number_confirmed", label: "Booth number confirmed" },
  { key: "products_match_category", label: "Products match approved category" },
  { key: "setup_follows_dimensions", label: "Setup follows booth dimensions" },
  { key: "electrical_checked", label: "Electrical requirements checked" },
  { key: "no_blocked_aisles", label: "No blocked aisles" },
  { key: "safety_check_completed", label: "Safety check completed" },
  { key: "booth_appearance_approved", label: "Booth appearance approved" },
  { key: "issue_resolved", label: "Issue resolved (if any)" },
];

export function SetupChecklistForm({
  applicationId,
  eventId,
  checklist,
  photoSignedUrl,
}: {
  applicationId: string;
  eventId: string;
  checklist: Checklist;
  photoSignedUrl: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = React.useTransition();
  const [needsChangesOpen, setNeedsChangesOpen] = React.useState(false);
  const [issueText, setIssueText] = React.useState(checklist?.issue_found ?? "");

  function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateChecklistAction(applicationId, eventId, formData);
      if (!result.ok) {
        toast({ title: "Couldn't save", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Checklist saved", variant: "success" });
      router.refresh();
    });
  }

  function onApprove() {
    startTransition(async () => {
      const result = await markSetupApprovedAction(applicationId, eventId);
      if (!result.ok) {
        toast({ title: "Couldn't approve", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Setup approved", variant: "success" });
      router.refresh();
    });
  }

  function onNeedsChanges() {
    startTransition(async () => {
      const result = await markNeedsChangesAction(applicationId, eventId, issueText);
      if (!result.ok) {
        toast({ title: "Couldn't save", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Marked as needing changes", variant: "success" });
      setNeedsChangesOpen(false);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSave} className="space-y-6" encType="multipart/form-data">
      <fieldset className="space-y-2">
        <legend className="mb-3 text-sm font-semibold text-ink-900">Setup verification</legend>
        {CHECKLIST_ITEMS.map((item) => (
          <label key={item.key} className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" name={item.key} defaultChecked={Boolean(checklist?.[item.key])} />
            {item.label}
          </label>
        ))}
      </fieldset>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-800" htmlFor="issue_found">
          Issue found
        </label>
        <Textarea id="issue_found" name="issue_found" rows={2} maxLength={2000} defaultValue={checklist?.issue_found ?? ""} />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-800" htmlFor="notes">
          Notes
        </label>
        <Textarea id="notes" name="notes" rows={2} maxLength={5000} defaultValue={checklist?.notes ?? ""} />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-800" htmlFor="photo">
          Photo <span className="font-normal text-ink-500">(PNG, JPEG, or WEBP, up to 5 MB)</span>
        </label>
        <FileInput id="photo" name="photo" accept="image/png,image/jpeg,image/webp" previewUrls={photoSignedUrl ? [photoSignedUrl] : []} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={isPending}>
          Save checklist
        </Button>
        <Button type="button" variant="outline" onClick={onApprove} loading={isPending}>
          Mark setup approved
        </Button>
        <Button type="button" variant="danger" onClick={() => setNeedsChangesOpen(true)}>
          Needs changes
        </Button>
      </div>

      {checklist?.final_approval && (
        <p className="text-sm font-medium text-emerald-700">Final approval given.</p>
      )}

      <ConfirmDialog
        open={needsChangesOpen}
        onOpenChange={setNeedsChangesOpen}
        title="Mark setup as needing changes"
        confirmLabel="Save"
        confirmVariant="danger"
        loading={isPending}
        onConfirm={onNeedsChanges}
      >
        <div>
          <label htmlFor="needs-changes-issue" className="mb-1.5 block text-sm font-medium text-ink-800">
            Issue requiring attention
          </label>
          <Textarea
            id="needs-changes-issue"
            autoFocus
            required
            rows={3}
            maxLength={2000}
            value={issueText}
            onChange={(e) => setIssueText(e.target.value)}
          />
        </div>
      </ConfirmDialog>
    </form>
  );
}
