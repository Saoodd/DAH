import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "info" | "success" | "warning" | "error";

const variantClasses: Record<Variant, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-red-200 bg-red-50 text-red-800",
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
      className={cn("rounded-xl border px-4 py-3 text-sm", variantClasses[variant], className)}
      {...props}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && "mt-1")}>{children}</div>}
    </div>
  );
}
