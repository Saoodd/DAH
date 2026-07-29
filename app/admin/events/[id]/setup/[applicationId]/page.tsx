import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getSignedFileUrl } from "@/lib/storage";
import { generateQrDataUrl } from "@/lib/qr";
import { getSiteUrl } from "@/lib/env";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SetupChecklistForm } from "@/components/admin/setup-checklist-form";
import { formatUaePhoneDisplay } from "@/lib/format";

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
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-500">
        <Link href={`/admin/events/${id}/setup`} className="hover:text-brand-600">
          Setup check-in
        </Link>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold text-ink-950">
          Booth {booth?.booth_number ?? "—"} setup checklist
        </h1>
        <p className="mt-1 text-sm text-ink-500">{business?.business_name ?? "Vendor"}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <Card>
          <CardHeader>
            <CardTitle>Vendor and booth details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="mb-6 grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-ink-400">Category</dt>
              <dd className="text-ink-800">{business?.categories?.name ?? "—"}</dd>
              <dt className="text-ink-400">Phone</dt>
              <dd className="text-ink-800">{business ? formatUaePhoneDisplay(business.phone) : "—"}</dd>
              <dt className="text-ink-400">Booth size</dt>
              <dd className="text-ink-800">{booth?.size_label ?? "—"}</dd>
            </dl>
            <SetupChecklistForm applicationId={applicationId} eventId={id} checklist={checklist ?? null} photoSignedUrl={photoSignedUrl} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="Scan to open this checklist" width={200} height={200} />
            <p className="text-xs text-ink-400">Scan to reopen this checklist on another device.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
