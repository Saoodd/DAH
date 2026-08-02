"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bulkApproveBusinessesAction } from "@/app/admin/vendors/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { APPROVAL_STATUS_COLORS, APPROVAL_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ApprovalStatus } from "@/types/database";

interface VendorRow {
  id: string;
  business_name: string;
  owner_name: string;
  email: string;
  phone: string;
  approval_status: ApprovalStatus;
  created_at: string;
}

export function VendorsTable({ businesses }: { businesses: VendorRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const selectableIds = businesses.filter((b) => b.approval_status === "pending_review").map((b) => b.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmBulkApprove() {
    startTransition(async () => {
      const result = await bulkApproveBusinessesAction(Array.from(selected));
      if (!result.ok) {
        toast({ title: "Bulk approve failed", description: result.error, variant: "error" });
        return;
      }
      toast({ title: `${selected.size} vendor(s) approved`, variant: "success" });
      setSelected(new Set());
      setBulkDialogOpen(false);
      router.refresh();
    });
  }

  if (!businesses.length) {
    return (
      <EmptyState
        icon={<Icon name="users" size="lg" />}
        title="No vendors match this filter"
        description="Try a different status filter, or clear your search to see every registered business."
      />
    );
  }

  const checkboxClasses =
    "h-5 w-5 rounded border-ink-300 accent-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700";

  return (
    <div>
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 border-b border-brand-200/70 bg-brand-50/70 px-6 py-3 animate-[var(--animate-in)]">
          <p className="text-sm font-medium text-ink-800">
            <span className="font-semibold tabular-nums text-brand-800">{selected.size}</span> selected
          </p>
          <Button size="sm" onClick={() => setBulkDialogOpen(true)}>
            <Icon name="check" size="sm" />
            Approve selected
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/50 text-left text-caption font-semibold uppercase tracking-[0.08em] text-ink-400">
              <th className="w-10 px-6 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={selectableIds.length === 0}
                  aria-label="Select all"
                  className={checkboxClasses}
                  title={selectableIds.length === 0 ? "Only vendors pending review can be selected" : undefined}
                />
              </th>
              <th className="px-6 py-3 font-semibold">Business</th>
              <th className="px-6 py-3 font-semibold">Contact</th>
              <th className="px-6 py-3 font-semibold">Status</th>
              <th className="px-6 py-3 font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {businesses.map((b) => (
              <tr
                key={b.id}
                className={cn(
                  "transition-colors hover:bg-ink-50/70",
                  selected.has(b.id) && "bg-brand-50/40"
                )}
              >
                <td className="px-6 py-4">
                  {b.approval_status === "pending_review" && (
                    <input
                      type="checkbox"
                      checked={selected.has(b.id)}
                      onChange={() => toggleOne(b.id)}
                      aria-label={`Select ${b.business_name}`}
                      className={checkboxClasses}
                    />
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-semibold text-brand-700"
                      aria-hidden="true"
                    >
                      {b.business_name.trim().charAt(0).toUpperCase() || "•"}
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/admin/vendors/${b.id}`}
                        className="font-semibold text-ink-900 transition-colors hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                      >
                        {b.business_name}
                      </Link>
                      <p className="text-caption text-ink-400">{b.owner_name}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-ink-600">
                  <p>{b.email}</p>
                  <p className="text-caption text-ink-400">{b.phone}</p>
                </td>
                <td className="px-6 py-4">
                  <Badge className={APPROVAL_STATUS_COLORS[b.approval_status]}>
                    {APPROVAL_STATUS_LABELS[b.approval_status]}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-ink-500">{formatDate(b.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        title={`Approve ${selected.size} vendor(s)?`}
        description="They'll immediately be able to register for the open event."
        confirmLabel="Approve all"
        loading={isPending}
        onConfirm={confirmBulkApprove}
      />
    </div>
  );
}
