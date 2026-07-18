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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-950">Export centre</h1>
        <p className="mt-1 text-sm text-ink-500">
          CSV exports, formatted for AED currency and UAE phone numbers — open directly in Excel or Sheets.
        </p>
      </div>

      <ExportCentre datasets={datasets} events={events ?? []} />
    </div>
  );
}
