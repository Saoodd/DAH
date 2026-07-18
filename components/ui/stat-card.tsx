import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  href?: string;
  icon?: ReactNode;
  tone?: "default" | "brand" | "success" | "warning" | "danger";
  hint?: string;
}

const toneClasses: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "bg-ink-50 text-ink-600",
  brand: "bg-brand-50 text-brand-600",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
  danger: "bg-red-50 text-red-600",
};

const valueToneClasses: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-ink-950",
  brand: "text-brand-700",
  success: "text-emerald-700",
  warning: "text-amber-700",
  danger: "text-red-700",
};

export function StatCard({ label, value, href, icon, tone = "default", hint }: StatCardProps) {
  const body = (
    <Card
      className={cn(
        "h-full p-5 transition-all duration-150",
        href && "hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-md"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-500">{label}</p>
          <p className={cn("mt-1.5 text-2xl font-semibold tracking-tight", valueToneClasses[tone])}>{value}</p>
          {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
        </div>
        {icon && (
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", toneClasses[tone])}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );

  if (!href) return body;

  return (
    <Link href={href} className="group block" aria-label={`${label}: ${value}`}>
      {body}
    </Link>
  );
}
