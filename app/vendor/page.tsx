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
import { APPROVAL_STATUS_COLORS, APPROVAL_STATUS_LABELS, NEXT_STEP_COPY } from "@/lib/constants";
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
          <CardTitle>Dar Al Hay events</CardTitle>
          <CardDescription>Event registration opens once your business is approved.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-500">
            {business.approval_status === "approved"
              ? "There is no open event right now. We'll notify you the moment registration opens."
              : "Get approved to unlock event registration, booth selection, and payment."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
