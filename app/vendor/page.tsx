import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getOwnedBusiness } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { isEventRegistrationOpen } from "@/lib/event-registration";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmitProfileButton } from "@/components/vendor/submit-profile-button";
import { ApplyButton } from "@/components/vendor/apply-button";
import { VendorProgress } from "@/components/vendor/vendor-progress";
import {
  APPROVAL_STATUS_COLORS,
  APPROVAL_STATUS_LABELS,
  APPLICATION_STATUS_LABELS,
  NEXT_STEP_COPY,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ApplicationStatus, Database } from "@/types/database";

export const metadata: Metadata = { title: "Dashboard" };

const NEXT_STEP_TONE: Record<string, "warning" | "info" | "error"> = {
  profile_incomplete: "warning",
  pending_review: "info",
  rejected: "error",
  suspended: "error",
  blacklisted: "error",
};

const toneCardClasses: Record<"warning" | "info" | "error", string> = {
  warning: "border-amber-200 bg-amber-50/60",
  info: "border-blue-200 bg-blue-50/60",
  error: "border-red-200 bg-red-50/60",
};

const toneIconClasses: Record<"warning" | "info" | "error", string> = {
  warning: "bg-amber-100 text-amber-700",
  info: "bg-blue-100 text-blue-700",
  error: "bg-red-100 text-red-700",
};

const toneIconNames: Record<"warning" | "info" | "error", IconName> = {
  warning: "warning",
  info: "clock",
  error: "warning",
};

type DashboardEvent = Pick<
  Database["public"]["Tables"]["events"]["Row"],
  | "id"
  | "name"
  | "location"
  | "description"
  | "vendor_rules"
  | "setup_instructions"
  | "start_at"
  | "end_at"
  | "registration_status"
  | "registration_opens_at"
  | "registration_closes_at"
  | "is_archived"
>;

const ACTIVE_APPLICATION_STATUSES: ApplicationStatus[] = [
  "submitted",
  "under_review",
  "approved",
  "booth_selection_available",
  "booth_selected",
  "awaiting_payment",
  "payment_under_review",
  "confirmed",
];

function relatedEvent(value: unknown): DashboardEvent | null {
  if (Array.isArray(value)) return (value[0] as DashboardEvent | undefined) ?? null;
  return (value as DashboardEvent | null) ?? null;
}

function isUpcomingOrActiveEvent(event: DashboardEvent | null, now: Date = new Date()): boolean {
  if (!event || event.is_archived) return false;
  if (!event.end_at) return true;
  const endAt = Date.parse(event.end_at);
  return Number.isNaN(endAt) || endAt > now.getTime();
}

function EventMeta({ location, startAt, endAt }: { location: string | null; startAt: string | null; endAt: string | null }) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
      <span className="flex items-center gap-1.5">
        <Icon name="map-pin" size="xs" strokeWidth={1.5} className="text-ink-400" />
        {location ?? "Location TBA"}
      </span>
      <span className="flex items-center gap-1.5">
        <Icon name="calendar" size="xs" strokeWidth={1.5} className="text-ink-400" />
        {formatDate(startAt)} – {formatDate(endAt)}
      </span>
    </p>
  );
}

function EventDetails({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-ink-100 bg-ink-50/40 text-sm text-ink-600 open:bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 font-medium text-ink-800 transition-colors hover:text-ink-950 [&::-webkit-details-marker]:hidden">
        <Icon
          name="chevron-right"
          size="xs"
          strokeWidth={2}
          className="shrink-0 text-ink-400 transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        {summary}
      </summary>
      <div className="whitespace-pre-line px-4 pb-4 pl-10 leading-relaxed">{children}</div>
    </details>
  );
}

export default async function VendorDashboardPage() {
  const business = await getOwnedBusiness();

  if (!business) {
    return (
      <div className="page-enter space-y-6">
        <h1 className="font-display text-h1 text-ink-950">Welcome</h1>
        <Alert variant="warning" title="No business profile found">
          Something went wrong creating your profile during sign-up.{" "}
          <Link href="/vendor/profile?new=1" className="font-medium underline">
            Set it up now
          </Link>
          .
        </Alert>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: category } = business.category_id
    ? await supabase.from("categories").select("name").eq("id", business.category_id).maybeSingle()
    : { data: null };

  const isProfileComplete = Boolean(
    business.business_name && business.owner_name && business.category_id && business.description && business.logo_url
  );
  const canSubmit = isProfileComplete && ["profile_incomplete", "rejected"].includes(business.approval_status);
  const nextStep = NEXT_STEP_COPY[business.approval_status];
  const nextStepTone = NEXT_STEP_TONE[business.approval_status] ?? "info";

  const [registrationResult, applicationsResult] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, name, location, description, vendor_rules, setup_instructions, start_at, end_at, registration_status, registration_opens_at, registration_closes_at, is_archived"
      )
      .eq("registration_status", "open")
      .eq("is_archived", false)
      .order("start_at", { ascending: true }),
    supabase
      .from("applications")
      .select(
        "id, event_id, status, rejection_reason, created_at, events(id, name, location, description, vendor_rules, setup_instructions, start_at, end_at, registration_status, registration_opens_at, registration_closes_at, is_archived)"
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false }),
  ]);

  const openEvent = registrationResult.data?.find((event) => isEventRegistrationOpen(event)) ?? null;
  const applications = applicationsResult.data ?? [];
  const currentApplication = openEvent
    ? applications.find((application) => application.event_id === openEvent.id) ?? null
    : null;
  const activeApplication =
    applications.find(
      (application) =>
        ACTIVE_APPLICATION_STATUSES.includes(application.status) &&
        isUpcomingOrActiveEvent(relatedEvent(application.events))
    ) ?? null;
  const activeApplicationToShow =
    activeApplication && activeApplication.id !== currentApplication?.id ? activeApplication : null;
  const activeEvent = activeApplicationToShow ? relatedEvent(activeApplicationToShow.events) : null;
  const activeRegistrationOpen = activeEvent ? isEventRegistrationOpen(activeEvent) : false;
  const progressApplication = activeApplication ?? currentApplication;
  const pastApplications = applications.filter(
    (application) =>
      application.id !== currentApplication?.id && application.id !== activeApplicationToShow?.id
  );

  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-caption font-semibold uppercase tracking-[0.14em] text-brand-700">Vendor dashboard</p>
          <h1 className="mt-2 font-display text-h2 text-ink-950 sm:text-h1">
            Welcome, {business.business_name}
          </h1>
          <p className="mt-2 text-sm text-ink-500">Here&rsquo;s where your account stands and what to do next.</p>
        </div>
        <Badge className={cn("px-3 py-1.5 text-sm", APPROVAL_STATUS_COLORS[business.approval_status])}>
          {APPROVAL_STATUS_LABELS[business.approval_status]}
        </Badge>
      </div>

      {(registrationResult.error || applicationsResult.error) && (
        <Alert variant="error" title="Some event information could not be loaded">
          Refresh the page to try again. Your profile information is still safe.
        </Alert>
      )}

      <VendorProgress
        approvalStatus={business.approval_status}
        applicationStatus={progressApplication?.status ?? null}
        hasEventContext={Boolean(openEvent || activeApplication)}
      />

      {nextStep && (
        <Card className={cn("border shadow-md", toneCardClasses[nextStepTone])}>
          <CardContent className="flex flex-col justify-between gap-5 py-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                  toneIconClasses[nextStepTone]
                )}
                aria-hidden="true"
              >
                <Icon name={toneIconNames[nextStepTone]} strokeWidth={1.5} />
              </span>
              <div>
                <p className="text-caption font-semibold uppercase tracking-[0.12em] text-ink-500">Your next step</p>
                <p className="mt-1 text-h4 font-semibold text-ink-950">{nextStep.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-600">{nextStep.description}</p>
                {business.approval_status === "rejected" && business.rejection_reason && (
                  <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
                    Reason: {business.rejection_reason}
                  </p>
                )}
              </div>
            </div>
            {canSubmit && <SubmitProfileButton />}
            {!isProfileComplete && business.approval_status === "profile_incomplete" && (
              <Link href="/vendor/profile" className={buttonVariants({ variant: "primary", className: "shrink-0" })}>
                Complete profile
                <Icon name="arrow-right" size="sm" />
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {business.requires_reapproval && business.approval_status === "approved" && (
        <Alert variant="warning" title="Profile changes pending review">
          You edited your profile after approval. An admin will re-review it before your next booth
          selection.
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Business profile</CardTitle>
            <CardDescription>Last updated {formatDate(business.last_profile_update)}</CardDescription>
          </div>
          <Link href="/vendor/profile" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Edit
          </Link>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-start">
          {business.logo_url ? (
            <Image
              src={business.logo_url}
              alt={`${business.business_name} logo`}
              width={64}
              height={64}
              className="h-16 w-16 shrink-0 rounded-xl object-cover shadow-xs ring-1 ring-ink-100"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-ink-50 text-caption text-ink-400 ring-1 ring-inset ring-ink-200">
              No logo
            </div>
          )}
          <dl className="grid flex-1 grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-caption font-medium uppercase tracking-wide text-ink-400">Owner</dt>
              <dd className="mt-0.5 font-medium text-ink-800">{business.owner_name}</dd>
            </div>
            <div>
              <dt className="text-caption font-medium uppercase tracking-wide text-ink-400">Category</dt>
              <dd className="mt-0.5 font-medium text-ink-800">{category?.name ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="text-caption font-medium uppercase tracking-wide text-ink-400">Email</dt>
              <dd className="mt-0.5 font-medium text-ink-800">{business.email}</dd>
            </div>
            <div>
              <dt className="text-caption font-medium uppercase tracking-wide text-ink-400">Phone</dt>
              <dd className="mt-0.5 font-medium text-ink-800">{business.phone}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-caption font-medium uppercase tracking-wide text-ink-400">Description</dt>
              <dd className="mt-0.5 leading-relaxed text-ink-700">{business.description || "Not set"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {activeApplicationToShow && activeEvent && (
        <Card>
          <CardHeader>
            <CardTitle>Active application</CardTitle>
            <CardDescription>
              {activeRegistrationOpen
                ? "Your application is in progress."
                : "Registration is not currently open, but your application remains available."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="font-display text-h4 text-ink-950">{activeEvent.name}</p>
              <EventMeta location={activeEvent.location} startAt={activeEvent.start_at} endAt={activeEvent.end_at} />
              {activeEvent.description && (
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{activeEvent.description}</p>
              )}
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-ink-100 bg-ink-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-caption font-medium uppercase tracking-wide text-ink-400">
                  Your application status
                </p>
                <Badge className="mt-1.5 border-ink-200 bg-white text-ink-700">
                  {APPLICATION_STATUS_LABELS[activeApplicationToShow.status]}
                </Badge>
              </div>
              {((activeRegistrationOpen &&
                ["approved", "booth_selection_available"].includes(
                  activeApplicationToShow.status
                )) ||
                activeApplicationToShow.status === "booth_selected") && (
                  <Link
                    href="/vendor/booths"
                    className={buttonVariants({ variant: "primary", className: "shrink-0" })}
                  >
                    {activeApplicationToShow.status === "booth_selected" ? "View your booth" : "Select your booth"}
                    <Icon name="arrow-right" size="sm" />
                  </Link>
                )}
              {["awaiting_payment", "payment_under_review", "confirmed"].includes(
                activeApplicationToShow.status
              ) && (
                <Link
                  href="/vendor/payment"
                  className={buttonVariants({ variant: "primary", className: "shrink-0" })}
                >
                  {activeApplicationToShow.status === "awaiting_payment" ? "Complete payment" : "View payment"}
                  <Icon name="arrow-right" size="sm" />
                </Link>
              )}
            </div>

            {!activeRegistrationOpen &&
              ["approved", "booth_selection_available"].includes(
                activeApplicationToShow.status
              ) && (
                <Alert variant="info">
                  Booth selection is not available outside the registration window. Contact Dar Al Hay if you need
                  help with this application.
                </Alert>
              )}

            {activeEvent.vendor_rules && (
              <EventDetails summary="Vendor rules">{activeEvent.vendor_rules}</EventDetails>
            )}
            {activeEvent.setup_instructions && (
              <EventDetails summary="Setup instructions">{activeEvent.setup_instructions}</EventDetails>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Open registration</CardTitle>
          <CardDescription>
            {openEvent ? "Registration is open." : "No event is accepting applications right now."}
          </CardDescription>
        </CardHeader>
        <CardContent className={cn((business.approval_status !== "approved" || !openEvent) && "p-0")}>
          {business.approval_status !== "approved" ? (
            <EmptyState
              icon={<Icon name="calendar" size="lg" />}
              title="Registration unlocks after approval"
              description="Get approved to unlock event registration, booth selection, and payment."
            />
          ) : !openEvent ? (
            <EmptyState
              icon={<Icon name="calendar" size="lg" />}
              title="No open event right now"
              description="We'll notify you the moment registration opens for the next Dar Al Hay event."
            />
          ) : (
            <div className="space-y-4">
              <div>
                <p className="font-display text-h4 text-ink-950">{openEvent.name}</p>
                <EventMeta location={openEvent.location} startAt={openEvent.start_at} endAt={openEvent.end_at} />
                {openEvent.description && (
                  <p className="mt-2 text-sm leading-relaxed text-ink-600">{openEvent.description}</p>
                )}
              </div>

              {!currentApplication || currentApplication.status === "not_started" ? (
                <ApplyButton eventId={openEvent.id} />
              ) : (
                <div className="flex flex-col gap-3 rounded-xl border border-ink-100 bg-ink-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-caption font-medium uppercase tracking-wide text-ink-400">Your application status</p>
                    <Badge className="mt-1.5 border-ink-200 bg-white text-ink-700">
                      {APPLICATION_STATUS_LABELS[currentApplication.status]}
                    </Badge>
                    {currentApplication.status === "rejected" && currentApplication.rejection_reason && (
                      <p className="mt-2 max-w-md rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                        Reason: {currentApplication.rejection_reason}
                      </p>
                    )}
                  </div>
                  {["approved", "booth_selection_available", "booth_selected"].includes(currentApplication.status) && (
                    <Link href="/vendor/booths" className={buttonVariants({ variant: "primary", className: "shrink-0" })}>
                      {currentApplication.status === "booth_selected" ? "View your booth" : "Select your booth"}
                      <Icon name="arrow-right" size="sm" />
                    </Link>
                  )}
                  {["awaiting_payment", "payment_under_review", "confirmed"].includes(currentApplication.status) && (
                    <Link href="/vendor/payment" className={buttonVariants({ variant: "primary", className: "shrink-0" })}>
                      {currentApplication.status === "awaiting_payment" ? "Complete payment" : "View payment"}
                      <Icon name="arrow-right" size="sm" />
                    </Link>
                  )}
                </div>
              )}

              {openEvent.vendor_rules && (
                <EventDetails summary="Vendor rules">{openEvent.vendor_rules}</EventDetails>
              )}
              {openEvent.setup_instructions && (
                <EventDetails summary="Setup instructions">{openEvent.setup_instructions}</EventDetails>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!!pastApplications?.length && (
        <Card>
          <CardHeader>
            <CardTitle>Past Dar Al Hay events</CardTitle>
            <CardDescription>Events you&rsquo;ve applied to before.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-ink-100">
              {pastApplications.map((application) => {
                const pastEvent = application.events as unknown as {
                  id: string;
                  name: string;
                  start_at: string | null;
                  location: string | null;
                } | null;
                return (
                  <li key={application.id} className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-ink-50/60">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-900">{pastEvent?.name ?? "Event"}</p>
                      <p className="mt-0.5 text-caption text-ink-400">
                        {pastEvent?.location ?? "—"} · {formatDate(pastEvent?.start_at)}
                      </p>
                    </div>
                    <Badge className="shrink-0 border-ink-200 bg-ink-50 text-ink-700">
                      {APPLICATION_STATUS_LABELS[application.status]}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
