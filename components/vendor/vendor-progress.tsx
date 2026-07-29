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
    <ol className="grid grid-cols-1 gap-3 rounded-2xl border border-ink-100 bg-white p-4 shadow-xs sm:grid-cols-2 sm:gap-4 sm:p-5 xl:flex xl:items-center xl:gap-0">
      {steps.map((step, i) => (
        <li
          key={step.label}
          className="flex min-w-0 items-center gap-3 xl:flex-1"
          aria-current={step.state === "current" ? "step" : undefined}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors motion-reduce:transition-none",
                step.state === "done" && "bg-emerald-700 text-white",
                step.state === "current" && "bg-brand-700 text-white ring-4 ring-brand-100",
                step.state === "upcoming" && "bg-ink-100 text-ink-600",
                step.state === "blocked" && "bg-red-700 text-white"
              )}
            >
              {step.state === "done" ? (
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M16.704 5.29a1 1 0 010 1.415l-7.25 7.25a1 1 0 01-1.414 0l-3.25-3.25a1 1 0 111.414-1.414l2.543 2.543 6.543-6.543a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : step.state === "blocked" ? (
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <span
              className={cn(
                "min-w-0 text-sm font-medium leading-5",
                step.state === "upcoming" ? "text-ink-400" : "text-ink-800"
              )}
            >
              {step.label}
              <span className="sr-only"> — {STEP_STATE_LABELS[step.state]}</span>
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              aria-hidden="true"
              className={cn("mx-3 hidden h-px flex-1 xl:block", step.state === "done" ? "bg-emerald-300" : "bg-ink-100")}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
