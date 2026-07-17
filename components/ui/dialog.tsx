"use client";

import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonProps["variant"];
  loading?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "primary",
  loading,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="absolute inset-0 bg-ink-950/50" onClick={() => onOpenChange(false)} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-ink-950">
          {title}
        </h2>
        {description && <p className="mt-2 text-sm text-ink-500">{description}</p>}
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
