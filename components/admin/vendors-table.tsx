"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { bulkApproveBusinessesAction } from "@/app/admin/vendors/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { APPROVAL_STATUS_COLORS, APPROVAL_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
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
    return <p className="px-6 py-8 text-center text-sm text-ink-400">No vendors match this filter.</p>;
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="flex items-center justify-between border-b border-ink-100 bg-brand-50/60 px-6 py-3">
          <p className="text-sm font-medium text-ink-800">{selected.size} selected</p>
          <Button size="sm" onClick={() => setBulkDialogOpen(true)}>
            Approve selected
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
              <th className="w-10 px-6 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={selectableIds.length === 0}
                  aria-label="Select all"
                />
              </th>
              <th className="px-6 py-3 font-medium">Business</th>
              <th className="px-6 py-3 font-medium">Contact</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {businesses.map((b) => (
              <tr key={b.id} className="hover:bg-ink-50">
                <td className="px-6 py-4">
                  {b.approval_status === "pending_review" && (
                    <input
                      type="checkbox"
                      checked={selected.has(b.id)}
                      onChange={() => toggleOne(b.id)}
                      aria-label={`Select ${b.business_name}`}
                    />
                  )}
                </td>
                <td className="px-6 py-4">
                  <Link href={`/admin/vendors/${b.id}`} className="font-medium text-ink-900 hover:text-brand-600">
                    {b.business_name}
                  </Link>
                  <p className="text-xs text-ink-400">{b.owner_name}</p>
                </td>
                <td className="px-6 py-4 text-ink-600">
                  <p>{b.email}</p>
                  <p className="text-xs text-ink-400">{b.phone}</p>
                </td>
                <td className="px-6 py-4">
                  <Badge className={APPROVAL_STATUS_COLORS[b.approval_status]}>
                    {APPROVAL_STATUS_LABELS[b.approval_status]}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-ink-500">{formatDate(b.created_at)}</td>
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
