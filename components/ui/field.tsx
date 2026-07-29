import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

interface FieldControlProps {
  id?: string;
  required?: boolean;
  "aria-required"?: React.AriaAttributes["aria-required"];
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  "aria-describedby"?: string;
}

export function Field({ label, htmlFor, error, hint, required, children, className }: FieldProps) {
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;
  const messageId = error ? errorId : hint ? hintId : undefined;
  let child = children;

  if (React.isValidElement<FieldControlProps>(children)) {
    const childProps = children.props;
    const describedBy = Array.from(
      new Set(
        [childProps["aria-describedby"], messageId]
          .filter(Boolean)
          .flatMap((value) => value?.split(/\s+/) ?? [])
          .filter(Boolean)
      )
    ).join(" ");

    child = React.cloneElement(children, {
      id: childProps.id ?? htmlFor,
      required: childProps.required ?? (required || undefined),
      "aria-required": childProps["aria-required"] ?? (required || undefined),
      "aria-invalid": childProps["aria-invalid"] ?? (error ? true : undefined),
      "aria-describedby": describedBy || undefined,
    });
  }

  return (
    <div className={cn("w-full", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {child}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-ink-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600" role="alert">
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 8a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}
