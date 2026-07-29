import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-ink-900 text-white shadow-sm hover:bg-ink-800 hover:shadow-md active:bg-ink-950 focus-visible:outline-ink-900 disabled:bg-ink-200 disabled:text-ink-400 disabled:shadow-none",
  secondary:
    "bg-brand-700 text-white shadow-[var(--shadow-brand)] hover:bg-brand-800 active:bg-brand-900 focus-visible:outline-brand-700 disabled:bg-brand-100 disabled:text-brand-400 disabled:shadow-none",
  outline:
    "border border-ink-200 bg-white text-ink-900 shadow-xs hover:border-ink-300 hover:bg-ink-50 active:bg-ink-100 focus-visible:outline-ink-900 disabled:border-ink-100 disabled:text-ink-300 disabled:shadow-none",
  ghost:
    "text-ink-600 hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200 focus-visible:outline-ink-900 disabled:text-ink-300",
  danger:
    "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 focus-visible:outline-red-600 disabled:bg-red-200 disabled:shadow-none",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-lg gap-1.5",
  md: "h-11 px-4 text-sm rounded-xl gap-2",
  lg: "h-12 px-6 text-base rounded-xl gap-2",
};

export function buttonVariants({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
} = {}) {
  return cn(
    "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out",
    "active:scale-[0.98]",
    "disabled:cursor-not-allowed disabled:active:scale-100",
    "motion-reduce:transition-none motion-reduce:active:scale-100",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
    variantClasses[variant],
    sizeClasses[size],
    className
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={buttonVariants({ variant, size, className })}
        {...props}
      >
        {loading && (
          <svg className="h-4 w-4 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
