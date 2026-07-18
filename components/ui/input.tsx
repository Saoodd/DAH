import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl border border-ink-200 bg-white px-3.5 text-sm text-ink-900 shadow-xs placeholder:text-ink-400",
        "transition-[border-color,box-shadow] duration-150",
        "hover:border-ink-300",
        "focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100",
        "disabled:cursor-not-allowed disabled:border-ink-100 disabled:bg-ink-50 disabled:text-ink-300 disabled:shadow-none",
        "aria-[invalid=true]:border-red-400 aria-[invalid=true]:ring-4 aria-[invalid=true]:ring-red-100",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
