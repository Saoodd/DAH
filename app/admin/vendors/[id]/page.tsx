import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getSignedFileUrl } from "@/lib/storage";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VendorActions } from "@/components/admin/vendor-actions";
import { APPROVAL_STATUS_COLORS, APPROVAL_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Vendor Detail" };

export default async function AdminVendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("*, categories(name)")
    .eq("id", id)
    .maybeSingle();

  if (!business) notFound();

  const { data: auditLog } = await supabase
    .from("audit_logs")
    .select("action, created_at, previous_value, new_value, actor_role")
    .eq("entity_type", "business")
    .eq("entity_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  const tradeLicenseSignedUrl = business.trade_license_url
    ? await getSignedFileUrl(supabase, "trade-licenses", business.trade_license_url)
    : null;

  const category = (business as unknown as { categories: { name: string } | null }).categories;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-ink-950">{business.business_name}</h1>
          <p className="mt-1 text-sm text-ink-500">Owned by {business.owner_name}</p>
        </div>
        <Badge className={APPROVAL_STATUS_COLORS[business.approval_status]}>
          {APPROVAL_STATUS_LABELS[business.approval_status]}
        </Badge>
      </div>

      <VendorActions businessId={business.id} status={business.approval_status} />

      {business.approval_status === "rejected" && business.rejection_reason && (
        <Card>
          <CardContent className="py-4 text-sm text-red-700">
            <strong>Rejection reason:</strong> {business.rejection_reason}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Business details</CardTitle>
          <CardDescription>
            Submitted {formatDate(business.submitted_at)} · Last updated {formatDate(business.last_profile_update)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 sm:flex-row">
          {business.logo_url ? (
            <Image
              src={business.logo_url}
              alt=""
              width={80}
              height={80}
              className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-ink-100"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-xs text-ink-400">
              No logo
            </div>
          )}
          <dl className="grid flex-1 grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-400">Category</dt>
              <dd className="text-ink-800">{category?.name ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Instagram</dt>
              <dd className="text-ink-800">{business.instagram_username ? `@${business.instagram_username}` : "—"}</dd>
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
              <dd className="text-ink-800">{business.description || "—"}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Trade licence</dt>
              <dd className="text-ink-800">
                {tradeLicenseSignedUrl ? (
                  <a href={tradeLicenseSignedUrl} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:text-brand-700">
                    View document
                  </a>
                ) : (
                  "Not provided"
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {business.product_photo_urls?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Product photos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {business.product_photo_urls.map((url) => (
              <Image key={url} src={url} alt="" width={96} height={96} className="h-24 w-24 rounded-lg object-cover ring-1 ring-ink-100" />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Profile change history</CardTitle>
          <CardDescription>Every recorded change to this business, most recent first.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!auditLog?.length ? (
            <p className="px-6 py-8 text-center text-sm text-ink-400">No history yet.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {auditLog.map((entry, i) => (
                <li key={i} className="px-6 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink-800">{entry.action}</span>
                    <span className="text-xs text-ink-400">{formatDate(entry.created_at)}</span>
                  </div>
                  <p className="text-xs text-ink-400">by {entry.actor_role ?? "system"}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
