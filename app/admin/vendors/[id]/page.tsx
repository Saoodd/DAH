import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getSignedFileUrl } from "@/lib/storage";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { VendorActions } from "@/components/admin/vendor-actions";
import { APPROVAL_STATUS_COLORS, APPROVAL_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

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
    <div className="page-enter space-y-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-ink-400">
          <Link
            href="/admin/vendors"
            className="transition-colors hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            Vendors
          </Link>
          <span aria-hidden="true"> / </span>
          <span className="text-ink-600">{business.business_name}</span>
        </nav>
        <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-h2 text-ink-950 sm:text-h1">{business.business_name}</h1>
              <Badge className={cn("px-3 py-1.5", APPROVAL_STATUS_COLORS[business.approval_status])}>
                {APPROVAL_STATUS_LABELS[business.approval_status]}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-ink-500">Owned by {business.owner_name}</p>
          </div>
          <VendorActions businessId={business.id} status={business.approval_status} />
        </div>
      </div>

      {business.approval_status === "rejected" && business.rejection_reason && (
        <Alert variant="error" title="Rejection reason">
          {business.rejection_reason}
        </Alert>
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
              alt={`${business.business_name} logo`}
              width={80}
              height={80}
              className="h-20 w-20 shrink-0 rounded-xl object-cover shadow-xs ring-1 ring-ink-100"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-ink-50 text-caption text-ink-400 ring-1 ring-inset ring-ink-200">
              No logo
            </div>
          )}
          <dl className="grid flex-1 grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-caption font-medium uppercase tracking-wide text-ink-400">Category</dt>
              <dd className="mt-0.5 font-medium text-ink-800">{category?.name ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="text-caption font-medium uppercase tracking-wide text-ink-400">Instagram</dt>
              <dd className="mt-0.5 font-medium text-ink-800">
                {business.instagram_username ? `@${business.instagram_username}` : "—"}
              </dd>
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
              <dd className="mt-0.5 leading-relaxed text-ink-700">{business.description || "—"}</dd>
            </div>
            <div>
              <dt className="text-caption font-medium uppercase tracking-wide text-ink-400">Trade licence</dt>
              <dd className="mt-0.5">
                {tradeLicenseSignedUrl ? (
                  <a
                    href={tradeLicenseSignedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-medium text-brand-700 transition-colors hover:text-brand-800"
                  >
                    <Icon name="document" size="sm" />
                    View document
                  </a>
                ) : (
                  <span className="font-medium text-ink-800">Not provided</span>
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
            {business.product_photo_urls.map((url, i) => (
              <Image
                key={url}
                src={url}
                alt={`${business.business_name} product photo ${i + 1}`}
                width={96}
                height={96}
                className="h-24 w-24 rounded-xl object-cover shadow-xs ring-1 ring-ink-100"
              />
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
            <EmptyState
              icon={<Icon name="clipboard-list" size="lg" />}
              title="No history yet"
              description="Changes to this business will be recorded here."
            />
          ) : (
            <ol className="divide-y divide-ink-100">
              {auditLog.map((entry, i) => (
                <li key={i} className="flex gap-3.5 px-6 py-3.5 text-sm">
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-300 ring-4 ring-brand-50"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium text-ink-800">{entry.action}</span>
                      <span className="shrink-0 text-caption text-ink-400">{formatDate(entry.created_at)}</span>
                    </div>
                    <p className="text-caption text-ink-400">by {entry.actor_role ?? "system"}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
