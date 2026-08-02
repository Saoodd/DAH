import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getSignedFileUrl } from "@/lib/storage";
import { generateQrDataUrl } from "@/lib/qr";
import { getSiteUrl } from "@/lib/env";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SetupChecklistForm } from "@/components/admin/setup-checklist-form";
import { formatUaePhoneDisplay, normalizeUaePhone } from "@/lib/format";

export const metadata: Metadata = { title: "Setup Checklist" };

export default async function AdminSetupChecklistPage({
  params,
}: {
  params: Promise<{ id: string; applicationId: string }>;
}) {
  const { id, applicationId } = await params;
  const supabase = await createClient();

  const { data: application } = await supabase
    .from("applications")
    .select("id, businesses(business_name, phone, categories(name)), booths(booth_number, size_label)")
    .eq("id", applicationId)
    .eq("event_id", id)
    .maybeSingle();
  if (!application) notFound();

  const { data: checklist } = await supabase.from("setup_checklists").select("*").eq("application_id", applicationId).maybeSingle();

  const photoSignedUrl = checklist?.photo_url ? await getSignedFileUrl(supabase, "setup-photos", checklist.photo_url) : null;
  const qrDataUrl = await generateQrDataUrl(`${getSiteUrl()}/admin/events/${id}/setup/${applicationId}`);

  const business = application.businesses as unknown as { business_name: string; phone: string; categories: { name: string } | null } | null;
  const booth = application.booths as unknown as { booth_number: string; size_label: string | null } | null;

  return (
    <div className="page-enter space-y-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-ink-400">
          <Link
            href={`/admin/events/${id}/setup`}
            className="transition-colors hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            Setup check-in
          </Link>
          <span aria-hidden="true"> / </span>
          <span className="text-ink-600">Booth {booth?.booth_number ?? "—"}</span>
        </nav>
        <h1 className="mt-3 font-display text-h2 text-ink-950 sm:text-h1">
          Booth {booth?.booth_number ?? "—"}
        </h1>
        <p className="mt-2 text-sm text-ink-500">{business?.business_name ?? "Vendor"}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <Card>
          <CardHeader>
            <CardTitle>Setup checklist</CardTitle>
            <CardDescription>Work through each check, then approve or flag the setup.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="mb-6 grid grid-cols-1 gap-x-6 gap-y-4 rounded-xl border border-ink-100 bg-ink-50/50 px-4 py-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-caption font-medium uppercase tracking-wide text-ink-400">Category</dt>
                <dd className="mt-0.5 font-medium text-ink-800">{business?.categories?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-caption font-medium uppercase tracking-wide text-ink-400">Phone</dt>
                <dd className="mt-0.5 font-medium text-ink-800">
                  {business ? (
                    <a
                      href={`tel:${normalizeUaePhone(business.phone)}`}
                      className="tabular-nums text-brand-700 transition-colors hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                    >
                      {formatUaePhoneDisplay(business.phone)}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-caption font-medium uppercase tracking-wide text-ink-400">Booth size</dt>
                <dd className="mt-0.5 font-medium text-ink-800">{booth?.size_label ?? "—"}</dd>
              </div>
            </dl>
            <SetupChecklistForm applicationId={applicationId} eventId={id} checklist={checklist ?? null} photoSignedUrl={photoSignedUrl} />
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="Scan to open this checklist"
              width={200}
              height={200}
              className="rounded-xl ring-1 ring-ink-100"
            />
            <p className="text-caption font-semibold uppercase tracking-[0.08em] text-ink-400">Hand-off</p>
            <p className="text-xs text-ink-500">Scan to reopen this checklist on another device.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
