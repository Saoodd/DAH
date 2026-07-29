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
  const panelRef = React.useRef<HTMLDivElement>(null);
  const cancelButtonRef = React.useRef<HTMLButtonElement>(null);
  const onOpenChangeRef = React.useRef(onOpenChange);
  const titleId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  React.useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousBodyOverflow = document.body.style.overflow;
    let lastFocusedInside: HTMLElement | null = null;

    const getFocusableElements = () => {
      if (!panelRef.current) return [];

      return Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, object, embed, [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => {
        const style = window.getComputedStyle(element);
        return (
          element.tabIndex >= 0 &&
          element.getAttribute("aria-hidden") !== "true" &&
          !element.closest("[hidden], [inert]") &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      });
    };

    const focusInside = () => {
      const focusable = getFocusableElements();
      const cancelTarget =
        cancelButtonRef.current && !cancelButtonRef.current.disabled ? cancelButtonRef.current : null;
      const target =
        (lastFocusedInside && panelRef.current?.contains(lastFocusedInside) && !lastFocusedInside.matches(":disabled")
          ? lastFocusedInside
          : null) ??
        cancelTarget ??
        focusable[0] ??
        panelRef.current;

      target?.focus({ preventScroll: true });
    };

    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => focusInside());

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onOpenChangeRef.current(false);
        return;
      }

      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = getFocusableElements();

      if (focusable.length === 0) {
        e.preventDefault();
        panelRef.current.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);
      const activeElement = document.activeElement;
      const focusIsOutside = !panelRef.current.contains(activeElement);

      if (focusIsOutside || activeElement === panelRef.current) {
        e.preventDefault();
        (e.shiftKey ? last : first)?.focus({ preventScroll: true });
      } else if (e.shiftKey && activeElement === first) {
        e.preventDefault();
        last?.focus({ preventScroll: true });
      } else if (!e.shiftKey && activeElement === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    }

    function handleFocusIn(e: FocusEvent) {
      if (!panelRef.current) return;

      const target = e.target;
      if (target instanceof HTMLElement && panelRef.current.contains(target)) {
        lastFocusedInside = target;
        return;
      }

      focusInside();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      document.body.style.overflow = previousBodyOverflow;
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 animate-[var(--animate-in)] bg-ink-950/50 backdrop-blur-[2px]"
        onClick={() => onOpenChangeRef.current(false)}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="relative max-h-[min(90vh,40rem)] w-full max-w-md animate-[var(--animate-scale-in)] overflow-y-auto overscroll-contain rounded-2xl bg-white p-5 shadow-xl outline-none sm:p-6"
      >
        <h2 id={titleId} className="text-lg font-semibold tracking-tight text-ink-950">
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="mt-2 text-sm text-ink-500">
            {description}
          </p>
        )}
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-6 flex justify-end gap-3">
          <Button
            ref={cancelButtonRef}
            type="button"
            variant="outline"
            onClick={() => onOpenChangeRef.current(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button type="button" variant={confirmVariant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
