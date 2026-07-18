import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getOwnedBusiness } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { SubmitProfileButton } from "@/components/vendor/submit-profile-button";
import { ApplyButton } from "@/components/vendor/apply-button";
import {
  APPROVAL_STATUS_COLORS,
  APPROVAL_STATUS_LABELS,
  APPLICATION_STATUS_LABELS,
  NEXT_STEP_COPY,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

export default async function VendorDashboardPage() {
  const business = await getOwnedBusiness();

  if (!business) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-ink-950">Welcome</h1>
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

  const { data: openEvent } = await supabase
    .from("events")
    .select("id, name, location, description, vendor_rules, setup_instructions, start_at, end_at")
    .eq("registration_status", "open")
    .maybeSingle();

  const { data: currentApplication } = openEvent
    ? await supabase
        .from("applications")
        .select("id, status, rejection_reason")
        .eq("event_id", openEvent.id)
        .eq("business_id", business.id)
        .maybeSingle()
    : { data: null };

  const { data: pastApplications } = await supabase
    .from("applications")
    .select("id, status, created_at, events(id, name, start_at, end_at, location)")
    .eq("business_id", business.id)
    .neq("event_id", openEvent?.id ?? "00000000-0000-0000-0000-000000000000")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-ink-950">Welcome, {business.business_name}</h1>
          <p className="mt-1 text-sm text-ink-500">Here&rsquo;s the status of your Dar Al Hay account.</p>
        </div>
        <Badge className={APPROVAL_STATUS_COLORS[business.approval_status]}>
          {APPROVAL_STATUS_LABELS[business.approval_status]}
        </Badge>
      </div>

      {nextStep && (
        <Card>
          <CardContent className="flex flex-col justify-between gap-4 py-5 sm:flex-row sm:items-center">
            <div>
              <p className="font-semibold text-ink-900">{nextStep.title}</p>
              <p className="mt-1 text-sm text-ink-500">{nextStep.description}</p>
              {business.approval_status === "rejected" && business.rejection_reason && (
                <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  Reason: {business.rejection_reason}
                </p>
              )}
            </div>
            {canSubmit && <SubmitProfileButton />}
            {!isProfileComplete && business.approval_status === "profile_incomplete" && (
              <Link href="/vendor/profile" className={buttonVariants({ variant: "primary" })}>
                Complete profile
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
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {business.logo_url ? (
            <Image
              src={business.logo_url}
              alt={`${business.business_name} logo`}
              width={64}
              height={64}
              className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-ink-100"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-xs text-ink-400">
              No logo
            </div>
          )}
          <dl className="grid flex-1 grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-400">Owner</dt>
              <dd className="text-ink-800">{business.owner_name}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Category</dt>
              <dd className="text-ink-800">{category?.name ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Email</dt>
              <dd className="text-ink-800">{business.email}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Phone</dt>
              <dd className="text-ink-800">{business.phone}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-ink-400">Description</dt>
              <dd className="text-ink-800">{business.description || "Not set"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current event</CardTitle>
          <CardDescription>
            {openEvent ? "Registration is open." : "Event registration opens once your business is approved."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {business.approval_status !== "approved" ? (
            <p className="text-sm text-ink-500">
              Get approved to unlock event registration, booth selection, and payment.
            </p>
          ) : !openEvent ? (
            <p className="text-sm text-ink-500">
              There is no open event right now. We&rsquo;ll notify you the moment registration opens.
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="font-semibold text-ink-900">{openEvent.name}</p>
                <p className="mt-1 text-sm text-ink-500">
                  {openEvent.location ?? "Location TBA"} · {formatDate(openEvent.start_at)} – {formatDate(openEvent.end_at)}
                </p>
                {openEvent.description && <p className="mt-2 text-sm text-ink-600">{openEvent.description}</p>}
              </div>

              {!currentApplication || currentApplication.status === "not_started" ? (
                <ApplyButton eventId={openEvent.id} />
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-ink-500">Your application status</p>
                    <Badge className="mt-1 border-ink-200 bg-ink-50 text-ink-700">
                      {APPLICATION_STATUS_LABELS[currentApplication.status]}
                    </Badge>
                    {currentApplication.status === "rejected" && currentApplication.rejection_reason && (
                      <p className="mt-2 max-w-md rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                        Reason: {currentApplication.rejection_reason}
                      </p>
                    )}
                  </div>
                  {["approved", "booth_selected", "awaiting_payment"].includes(currentApplication.status) && (
                    <Link href="/vendor/booths" className={buttonVariants({ variant: "primary" })}>
                      {currentApplication.status === "approved" ? "Select your booth" : "View your booth"}
                    </Link>
                  )}
                </div>
              )}

              {openEvent.vendor_rules && (
                <details className="text-sm text-ink-600">
                  <summary className="cursor-pointer font-medium text-ink-800">Vendor rules</summary>
                  <p className="mt-2 whitespace-pre-line">{openEvent.vendor_rules}</p>
                </details>
              )}
              {openEvent.setup_instructions && (
                <details className="text-sm text-ink-600">
                  <summary className="cursor-pointer font-medium text-ink-800">Setup instructions</summary>
                  <p className="mt-2 whitespace-pre-line">{openEvent.setup_instructions}</p>
                </details>
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
                  <li key={application.id} className="flex items-center justify-between gap-4 px-6 py-4">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">{pastEvent?.name ?? "Event"}</p>
                      <p className="text-xs text-ink-400">
                        {pastEvent?.location ?? "—"} · {formatDate(pastEvent?.start_at)}
                      </p>
                    </div>
                    <Badge className="border-ink-200 bg-ink-50 text-ink-700">
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
