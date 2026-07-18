"use client";

import * as React from "react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Dataset {
  id: string;
  label: string;
  requiresEvent: boolean;
  columns: { key: string; label: string }[];
}

export function ExportCentre({ datasets, events }: { datasets: Dataset[]; events: { id: string; name: string }[] }) {
  const [datasetId, setDatasetId] = React.useState(datasets[0]?.id ?? "");
  const [eventId, setEventId] = React.useState(events[0]?.id ?? "");
  const dataset = datasets.find((d) => d.id === datasetId) ?? datasets[0];
  const [selectedColumns, setSelectedColumns] = React.useState<Set<string>>(new Set(dataset?.columns.map((c) => c.key)));

  function selectDataset(id: string) {
    setDatasetId(id);
    const next = datasets.find((d) => d.id === id);
    setSelectedColumns(new Set(next?.columns.map((c) => c.key)));
  }

  function toggleColumn(key: string) {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const downloadHref = React.useMemo(() => {
    const params = new URLSearchParams({ dataset: datasetId, columns: Array.from(selectedColumns).join(",") });
    if (dataset?.requiresEvent && eventId) params.set("eventId", eventId);
    return `/admin/export/download?${params.toString()}`;
  }, [datasetId, selectedColumns, dataset, eventId]);

  return (
    <Card>
      <CardContent className="space-y-5 py-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-800">Dataset</label>
            <Select value={datasetId} onChange={(e) => selectDataset(e.target.value)}>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>
          {dataset?.requiresEvent && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-800">Event</label>
              <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink-800">Columns</p>
          <div className="flex flex-wrap gap-3">
            {dataset?.columns.map((c) => (
              <label key={c.key} className="flex items-center gap-1.5 text-sm text-ink-600">
                <input type="checkbox" checked={selectedColumns.has(c.key)} onChange={() => toggleColumn(c.key)} />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <Button
          disabled={selectedColumns.size === 0 || (dataset?.requiresEvent && !eventId)}
          onClick={() => {
            window.location.href = downloadHref;
          }}
        >
          Download CSV
        </Button>
      </CardContent>
    </Card>
  );
}
