"use client";

import * as React from "react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

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

  const totalColumns = dataset?.columns.length ?? 0;
  const allSelected = totalColumns > 0 && selectedColumns.size === totalColumns;

  function toggleAllColumns() {
    setSelectedColumns(allSelected ? new Set() : new Set(dataset?.columns.map((c) => c.key)));
  }

  const downloadHref = React.useMemo(() => {
    const params = new URLSearchParams({ dataset: datasetId, columns: Array.from(selectedColumns).join(",") });
    if (dataset?.requiresEvent && eventId) params.set("eventId", eventId);
    return `/admin/export/download?${params.toString()}`;
  }, [datasetId, selectedColumns, dataset, eventId]);

  const downloadDisabled = selectedColumns.size === 0 || (dataset?.requiresEvent && !eventId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configure export</CardTitle>
        <CardDescription>Pick a dataset, choose the columns you need, and download.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="export-dataset" className="mb-1.5 block text-sm font-medium text-ink-700">
              Dataset
            </label>
            <Select id="export-dataset" value={datasetId} onChange={(e) => selectDataset(e.target.value)}>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>
          {dataset?.requiresEvent && (
            <div>
              <label htmlFor="export-event" className="mb-1.5 block text-sm font-medium text-ink-700">
                Event
              </label>
              <Select id="export-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <fieldset>
          <legend className="sr-only">Columns</legend>
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink-700">
              <span aria-hidden="true">Columns</span>
              <span className="ml-2 font-normal tabular-nums text-ink-400">
                {selectedColumns.size} of {totalColumns} selected
              </span>
            </p>
            <button
              type="button"
              onClick={toggleAllColumns}
              className="text-xs font-medium text-brand-700 transition-colors hover:text-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {dataset?.columns.map((c) => (
              <label
                key={c.key}
                className="flex cursor-pointer select-none items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:border-ink-300 hover:bg-ink-50 has-checked:border-brand-300 has-checked:bg-brand-50 has-checked:text-brand-800"
              >
                <input
                  type="checkbox"
                  checked={selectedColumns.has(c.key)}
                  onChange={() => toggleColumn(c.key)}
                  className="h-3.5 w-3.5 rounded border-ink-300 accent-brand-700"
                />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-500">
          {selectedColumns.size === 0
            ? "Select at least one column to enable the download."
            : "Downloads as a UTF-8 CSV with a header row."}
        </p>
        <Button
          disabled={downloadDisabled}
          onClick={() => {
            window.location.href = downloadHref;
          }}
        >
          <Icon name="download" size="sm" />
          Download CSV
        </Button>
      </CardFooter>
    </Card>
  );
}
