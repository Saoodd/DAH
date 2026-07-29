import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { getDataset } from "@/lib/export-datasets";
import { toCsv } from "@/lib/export";
import { logAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const { authUser } = await requireAdmin();

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
  let rows: Record<string, unknown>[];
  try {
    rows = await dataset.fetch(supabase, eventId);
  } catch (error) {
    console.error("Export query failed", datasetId, error);
    return NextResponse.json(
      { error: "The export could not be generated. Please try again." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  const csv = toCsv(rows, columns);

  await logAudit(supabase, {
    actorId: authUser.id,
    actorRole: "admin",
    action: "export.downloaded",
    entityType: "export",
    entityId: null,
    metadata: {
      dataset: datasetId,
      event_id: eventId ?? null,
      columns: columns.map((column) => column.key),
      row_count: rows.length,
    },
  });

  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${datasetId}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
