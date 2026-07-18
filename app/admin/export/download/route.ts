import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { getDataset } from "@/lib/export-datasets";
import { toCsv } from "@/lib/export";

export async function GET(request: NextRequest) {
  await requireAdmin();

  const { searchParams } = new URL(request.url);
  const datasetId = searchParams.get("dataset") ?? "";
  const eventId = searchParams.get("eventId") ?? undefined;
  const columnsParam = searchParams.get("columns");

  const dataset = getDataset(datasetId);
  if (!dataset) {
    return NextResponse.json({ error: "Unknown export dataset." }, { status: 400 });
  }
  if (dataset.requiresEvent && !eventId) {
    return NextResponse.json({ error: "This export requires an event." }, { status: 400 });
  }

  const selectedKeys = columnsParam ? new Set(columnsParam.split(",")) : null;
  const columns = selectedKeys ? dataset.columns.filter((c) => selectedKeys.has(c.key)) : dataset.columns;
  if (columns.length === 0) {
    return NextResponse.json({ error: "Select at least one column." }, { status: 400 });
  }

  const supabase = await createClient();
  const rows = await dataset.fetch(supabase, eventId);
  const csv = toCsv(rows, columns);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${datasetId}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
