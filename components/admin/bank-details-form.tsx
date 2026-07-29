"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { upsertBankDetailsAction, deleteBankDetailsAction } from "@/app/admin/bank-details/actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { Database } from "@/types/database";

type BankDetails = Database["public"]["Tables"]["bank_details"]["Row"];

export function BankDetailsForm({ existing }: { existing: BankDetails | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await upsertBankDetailsAction(formData);
      if (!result.ok) {
        toast({ title: "Couldn't save", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Bank details saved", variant: "success" });
      router.refresh();
    });
  }

  function onDelete() {
    if (!existing) return;
    startTransition(async () => {
      const result = await deleteBankDetailsAction(existing.id);
      if (!result.ok) {
        toast({ title: "Couldn't delete", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Bank details deleted", variant: "success" });
      setDeleteOpen(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="py-5">
        <form onSubmit={onSubmit} className="space-y-4">
          {existing && <input type="hidden" name="id" value={existing.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bank name" htmlFor="bankName" required>
              <Input id="bankName" name="bankName" maxLength={100} defaultValue={existing?.bank_name} required />
            </Field>
            <Field label="Account name" htmlFor="accountName" required>
              <Input id="accountName" name="accountName" maxLength={150} defaultValue={existing?.account_name} required />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="IBAN" htmlFor="iban" required>
              <Input id="iban" name="iban" minLength={15} maxLength={42} autoCapitalize="characters" defaultValue={existing?.iban} required />
            </Field>
            <Field label="SWIFT / BIC" htmlFor="swiftCode">
              <Input id="swiftCode" name="swiftCode" minLength={8} maxLength={11} autoCapitalize="characters" defaultValue={existing?.swift_code ?? ""} />
            </Field>
          </div>
          <Field label="Notes for vendors" htmlFor="notes">
            <Textarea id="notes" name="notes" rows={2} maxLength={1000} defaultValue={existing?.notes ?? ""} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={isPending}>
              Save
            </Button>
            {existing && (
              <Button type="button" size="sm" variant="danger" onClick={() => setDeleteOpen(true)}>
                Delete
              </Button>
            )}
          </div>
        </form>
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete bank details?"
          description="Vendors will no longer see bank-transfer instructions until new details are saved."
          confirmLabel="Delete"
          confirmVariant="danger"
          loading={isPending}
          onConfirm={onDelete}
        />
      </CardContent>
    </Card>
  );
}
