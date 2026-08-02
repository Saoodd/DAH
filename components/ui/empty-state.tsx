import * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Glyph or small illustration, e.g. `<Icon name="inbox" size="lg" />`. */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Optional call to action, e.g. a `<Button>` or button-styled `<Link>`. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Consistent "nothing here yet" treatment for tables, lists, and panels.
 *
 *   <EmptyState
 *     icon={<Icon name="inbox" size="lg" />}
 *     title="No businesses yet"
 *     description="Approved vendors will appear here as they sign up."
 *     action={<Button size="sm">Invite a vendor</Button>}
 *   />
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && (
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-50 text-ink-400"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <p className={cn("text-sm font-semibold text-ink-900", icon && "mt-4")}>{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
