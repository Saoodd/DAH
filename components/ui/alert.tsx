import * as React from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

type Variant = "info" | "success" | "warning" | "error";

const variantClasses: Record<Variant, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
};

const iconClasses: Record<Variant, string> = {
  info: "text-blue-500",
  success: "text-emerald-500",
  warning: "text-amber-500",
  error: "text-red-500",
};

const iconNames: Record<Variant, IconName> = {
  info: "info",
  success: "circle-check",
  warning: "warning",
  error: "warning",
};

export function Alert({
  className,
  variant = "info",
  title,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: Variant; title?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-xs animate-[var(--animate-slide-up)]",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      <Icon name={iconNames[variant]} strokeWidth={1.5} className={cn("mt-0.5", iconClasses[variant])} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-1", "text-[0.925em] opacity-90")}>{children}</div>}
      </div>
    </div>
  );
}
