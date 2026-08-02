import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EXPORT_DATASETS } from "@/lib/export-datasets";
import { ExportCentre } from "@/components/admin/export-centre";

export const metadata: Metadata = { title: "Export Centre" };

export default async function AdminExportPage() {
  const supabase = await createClient();
  const { data: events } = await supabase.from("events").select("id, name").order("created_at", { ascending: false });

  const datasets = EXPORT_DATASETS.map(({ id, label, requiresEvent, columns }) => ({ id, label, requiresEvent, columns }));

  return (
    <div className="page-enter space-y-6">
      <div>
        <p className="text-caption font-semibold uppercase tracking-[0.14em] text-brand-700">Admin console</p>
        <h1 className="mt-2 font-display text-h2 text-ink-950 sm:text-h1">Export centre</h1>
        <p className="mt-2 text-sm text-ink-500">
          CSV exports, formatted for AED currency and UAE phone numbers — open directly in Excel or Sheets.
        </p>
      </div>

      <ExportCentre datasets={datasets} events={events ?? []} />
    </div>
  );
}
