import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { ApprovalStatus, ApplicationStatus } from "@/types/database";

type StepState = "done" | "current" | "upcoming" | "blocked";

interface VendorProgressProps {
  approvalStatus: ApprovalStatus;
  applicationStatus: ApplicationStatus | null;
  hasEventContext: boolean;
}

const BOOTH_DONE: ApplicationStatus[] = ["booth_selected", "awaiting_payment", "payment_under_review", "confirmed"];
const BOOTH_CURRENT: ApplicationStatus[] = ["approved", "booth_selection_available"];
const PAYMENT_CURRENT: ApplicationStatus[] = ["awaiting_payment", "payment_under_review"];

const STEP_STATE_LABELS: Record<StepState, string> = {
  done: "Completed",
  current: "Current step",
  upcoming: "Not started",
  blocked: "Unavailable",
};

export function VendorProgress({ approvalStatus, applicationStatus, hasEventContext }: VendorProgressProps) {
  const blocked = ["rejected", "suspended", "blacklisted"].includes(approvalStatus);

  const steps: { label: string; state: StepState }[] = [
    {
      label: "Profile submitted",
      state: approvalStatus === "profile_incomplete" ? "current" : "done",
    },
    {
      label: "Business approved",
      state: approvalStatus === "approved" ? "done" : blocked ? "blocked" : approvalStatus === "pending_review" ? "current" : "upcoming",
    },
    {
      label: "Booth selected",
      state:
        approvalStatus !== "approved" || !hasEventContext
          ? "upcoming"
          : applicationStatus && BOOTH_DONE.includes(applicationStatus)
            ? "done"
            : applicationStatus && BOOTH_CURRENT.includes(applicationStatus)
              ? "current"
              : "upcoming",
    },
    {
      label: "Payment confirmed",
      state:
        applicationStatus === "confirmed"
          ? "done"
          : applicationStatus && PAYMENT_CURRENT.includes(applicationStatus)
            ? "current"
            : "upcoming",
    },
  ];

  return (
    <ol
      aria-label="Your progress"
      className="grid grid-cols-1 gap-3 rounded-2xl border border-ink-100 bg-white p-4 shadow-sm sm:grid-cols-2 sm:gap-4 sm:p-5 xl:flex xl:items-center xl:gap-0"
    >
      {steps.map((step, i) => (
        <li
          key={step.label}
          className="flex min-w-0 items-center gap-3 xl:flex-1"
          aria-current={step.state === "current" ? "step" : undefined}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors motion-reduce:transition-none",
                step.state === "done" && "bg-emerald-600 text-white",
                step.state === "current" && "bg-brand-700 text-white shadow-[var(--shadow-brand)] ring-4 ring-brand-100",
                step.state === "upcoming" && "bg-ink-50 text-ink-400 ring-1 ring-inset ring-ink-200",
                step.state === "blocked" && "bg-red-600 text-white"
              )}
            >
              {step.state === "done" ? (
                <Icon name="check" size="sm" strokeWidth={2.25} />
              ) : step.state === "blocked" ? (
                <Icon name="close" size="sm" strokeWidth={2.25} />
              ) : (
                i + 1
              )}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  "block text-sm font-medium leading-5",
                  step.state === "upcoming" ? "text-ink-400" : "text-ink-900"
                )}
              >
                {step.label}
              </span>
              <span
                className={cn(
                  "block text-caption",
                  step.state === "current" ? "font-medium text-brand-700" : "text-ink-400"
                )}
              >
                {STEP_STATE_LABELS[step.state]}
              </span>
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              aria-hidden="true"
              className={cn(
                "mx-4 hidden h-px flex-1 rounded-full xl:block",
                step.state === "done" ? "bg-emerald-300" : "bg-ink-100"
              )}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
