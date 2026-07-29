"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  createBoothAction,
  updateBoothPositionAction,
  duplicateBoothAction,
  deleteBoothAction,
  createZoneAction,
  deleteZoneAction,
  createMapFeatureAction,
  updateMapFeaturePositionAction,
  deleteMapFeatureAction,
  releaseExpiredLocksAction,
} from "@/app/admin/events/[id]/booths/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { BoothDetailPanel } from "@/components/admin/booth-detail-panel";
import { useSyncedState } from "@/lib/use-synced-state";
import { MAP_FEATURE_LABELS } from "@/lib/constants";
import type { Database } from "@/types/database";

type Booth = Database["public"]["Tables"]["booths"]["Row"];
type Zone = Database["public"]["Tables"]["zones"]["Row"];
type MapFeature = Database["public"]["Tables"]["map_features"]["Row"];
type Category = { id: string; name: string };

const STATUS_FILL: Record<string, string> = {
  available: "#047857",
  locked: "#92400e",
  reserved: "#1d4ed8",
  awaiting_payment: "#c2410c",
  confirmed: "#6d28d9",
  admin_held: "#334155",
  blocked: "#b91c1c",
  unavailable: "#525252",
};

const KEYBOARD_DELTAS = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
} as const;

interface BoothMapEditorProps {
  eventId: string;
  initialBooths: Booth[];
  zones: Zone[];
  mapFeatures: MapFeature[];
  categories: Category[];
}

export function BoothMapEditor({ eventId, initialBooths, zones, mapFeatures, categories }: BoothMapEditorProps) {
  const router = useRouter();
  const { toast } = useToast();
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [selectedBoothId, setSelectedBoothId] = React.useState<string | null>(null);
  const [dragState, setDragState] = React.useState<{ id: string; kind: "booth" | "feature"; mode: "move" | "resize"; startX: number; startY: number; orig: { x: number; y: number; w: number; h: number } } | null>(null);
  const [localBooths, setLocalBooths] = useSyncedState(initialBooths);
  const [localFeatures, setLocalFeatures] = useSyncedState(mapFeatures);
  const [zoneFormOpen, setZoneFormOpen] = React.useState(false);
  const [featureFormOpen, setFeatureFormOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const mapTitleId = React.useId();
  const mapInstructionsId = React.useId();

  const selectedBooth = localBooths.find((b) => b.id === selectedBoothId) ?? null;

  function toSvgPoint(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  }

  function startDrag(
    e: React.PointerEvent,
    id: string,
    kind: "booth" | "feature",
    mode: "move" | "resize",
    orig: { x: number; y: number; w: number; h: number }
  ) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const point = toSvgPoint(e.clientX, e.clientY);
    setDragState({ id, kind, mode, startX: point.x, startY: point.y, orig });
    if (kind === "booth") setSelectedBoothId(id);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragState) return;
    const point = toSvgPoint(e.clientX, e.clientY);
    const dx = point.x - dragState.startX;
    const dy = point.y - dragState.startY;

    if (dragState.kind === "booth") {
      setLocalBooths((prev) =>
        prev.map((b) => {
          if (b.id !== dragState.id) return b;
          if (dragState.mode === "move") {
            return {
              ...b,
              map_x: clamp(dragState.orig.x + dx, 0, 100 - b.map_width),
              map_y: clamp(dragState.orig.y + dy, 0, 100 - b.map_height),
            };
          }
          return {
            ...b,
            map_width: clamp(dragState.orig.w + dx, 3, 100 - b.map_x),
            map_height: clamp(dragState.orig.h + dy, 3, 100 - b.map_y),
          };
        })
      );
    } else {
      setLocalFeatures((prev) =>
        prev.map((f) =>
          f.id === dragState.id
            ? {
                ...f,
                map_x: clamp(dragState.orig.x + dx, 0, 100 - f.map_width),
                map_y: clamp(dragState.orig.y + dy, 0, 100 - f.map_height),
              }
            : f
        )
      );
    }
  }

  function persistBoothPosition(booth: Booth) {
    startTransition(async () => {
      const result = await updateBoothPositionAction(booth.id, eventId, {
        mapX: booth.map_x,
        mapY: booth.map_y,
        mapWidth: booth.map_width,
        mapHeight: booth.map_height,
      });
      if (!result.ok) {
        toast({ title: "Couldn't update booth position", description: result.error, variant: "error" });
      }
    });
  }

  function persistFeaturePosition(feature: MapFeature) {
    startTransition(async () => {
      const result = await updateMapFeaturePositionAction(feature.id, eventId, {
        mapX: feature.map_x,
        mapY: feature.map_y,
      });
      if (!result.ok) {
        toast({ title: "Couldn't update map feature", description: result.error, variant: "error" });
      }
    });
  }

  function handleBoothKeyDown(e: React.KeyboardEvent<SVGRectElement>, booth: Booth) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelectedBoothId(booth.id);
      return;
    }

    const delta = KEYBOARD_DELTAS[e.key as keyof typeof KEYBOARD_DELTAS];
    if (!delta) return;

    e.preventDefault();
    e.stopPropagation();
    setSelectedBoothId(booth.id);

    const nextBooth: Booth = e.shiftKey
      ? {
          ...booth,
          map_width: clamp(booth.map_width + delta.x, 3, 100 - booth.map_x),
          map_height: clamp(booth.map_height + delta.y, 3, 100 - booth.map_y),
        }
      : {
          ...booth,
          map_x: clamp(booth.map_x + delta.x, 0, 100 - booth.map_width),
          map_y: clamp(booth.map_y + delta.y, 0, 100 - booth.map_height),
        };

    setLocalBooths((current) => current.map((item) => (item.id === booth.id ? nextBooth : item)));
  }

  function handleBoothKeyUp(e: React.KeyboardEvent<SVGRectElement>, booth: Booth) {
    if (KEYBOARD_DELTAS[e.key as keyof typeof KEYBOARD_DELTAS]) {
      persistBoothPosition(booth);
    }
  }

  function handleFeatureKeyDown(e: React.KeyboardEvent<SVGGElement>, feature: MapFeature) {
    const delta = KEYBOARD_DELTAS[e.key as keyof typeof KEYBOARD_DELTAS];
    if (!delta) return;

    e.preventDefault();
    e.stopPropagation();

    const nextFeature: MapFeature = {
      ...feature,
      map_x: clamp(feature.map_x + delta.x, 0, 100 - feature.map_width),
      map_y: clamp(feature.map_y + delta.y, 0, 100 - feature.map_height),
    };
    setLocalFeatures((current) => current.map((item) => (item.id === feature.id ? nextFeature : item)));
  }

  function handleFeatureKeyUp(e: React.KeyboardEvent<SVGGElement>, feature: MapFeature) {
    if (KEYBOARD_DELTAS[e.key as keyof typeof KEYBOARD_DELTAS]) {
      persistFeaturePosition(feature);
    }
  }

  function onPointerUp() {
    if (!dragState) return;
    const { id, kind } = dragState;
    setDragState(null);

    if (kind === "booth") {
      const booth = localBooths.find((b) => b.id === id);
      if (!booth) return;
      persistBoothPosition(booth);
    } else {
      const feature = localFeatures.find((f) => f.id === id);
      if (!feature) return;
      persistFeaturePosition(feature);
    }
  }

  function handleAddBooth() {
    startTransition(async () => {
      const result = await createBoothAction(eventId);
      if (!result.ok) {
        toast({ title: "Couldn't add booth", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Booth added", variant: "success" });
      router.refresh();
      if (result.id) setSelectedBoothId(result.id);
    });
  }

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const result = await duplicateBoothAction(id, eventId);
      if (!result.ok) {
        toast({ title: "Couldn't duplicate", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Booth duplicated", variant: "success" });
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteBoothAction(id, eventId);
      if (!result.ok) {
        toast({ title: "Couldn't delete", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Booth deleted", variant: "success" });
      setSelectedBoothId(null);
      router.refresh();
    });
  }

  function handleReleaseExpired() {
    startTransition(async () => {
      const result = await releaseExpiredLocksAction(eventId);
      if (!result.ok) {
        toast({ title: "Couldn't release locks", description: result.error, variant: "error" });
        return;
      }
      toast({ title: `${result.count ?? 0} expired lock(s) released`, variant: "success" });
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={handleAddBooth} loading={isPending}>
            Add booth
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setZoneFormOpen(true)}>
            Add zone
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setFeatureFormOpen(true)}>
            Add map feature
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={handleReleaseExpired}>
            Release expired locks
          </Button>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-ink-50/40 p-3">
          <p id={mapInstructionsId} className="mb-3 text-xs leading-5 text-ink-600">
            Keyboard: focus a booth and press Enter to select it. Use the arrow keys to move it, or Shift + arrow
            keys to resize it. Focus a map feature and use the arrow keys to move it.
          </p>
          <svg
            ref={svgRef}
            viewBox="0 0 100 100"
            role="group"
            aria-labelledby={mapTitleId}
            aria-describedby={mapInstructionsId}
            className="aspect-square w-full touch-none rounded-xl bg-white shadow-inner"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <title id={mapTitleId}>Interactive booth map editor</title>
            {localFeatures.map((f) => (
              <g
                key={f.id}
                role="group"
                tabIndex={0}
                aria-label={`${f.label || MAP_FEATURE_LABELS[f.type]} map feature. Use arrow keys to move.`}
                aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
                className="group outline-none"
                onKeyDown={(e) => handleFeatureKeyDown(e, f)}
                onKeyUp={(e) => handleFeatureKeyUp(e, f)}
                onPointerDown={(e) =>
                  startDrag(e, f.id, "feature", "move", {
                    x: f.map_x,
                    y: f.map_y,
                    w: f.map_width,
                    h: f.map_height,
                  })
                }
              >
                <rect
                  x={f.map_x}
                  y={f.map_y}
                  width={f.map_width}
                  height={f.map_height}
                  rx={1}
                  className="cursor-move fill-ink-200 stroke-ink-400 group-focus-visible:stroke-brand-700 group-focus-visible:stroke-[0.9]"
                  strokeWidth={0.3}
                  strokeDasharray="1,1"
                />
                <text
                  x={f.map_x + f.map_width / 2}
                  y={f.map_y + f.map_height / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={2.2}
                  className="fill-ink-600 select-none"
                  aria-hidden="true"
                >
                  {f.label || MAP_FEATURE_LABELS[f.type]}
                </text>
              </g>
            ))}

            {localBooths.map((b) => {
              const zone = zones.find((z) => z.id === b.zone_id);
              return (
                <g key={b.id}>
                  <rect
                    role="button"
                    tabIndex={0}
                    aria-label={`Booth ${b.booth_number}, ${b.status.replace(/_/g, " ")}.${selectedBoothId === b.id ? " Selected." : ""} Press Enter to select. Use arrow keys to move, or Shift + arrow keys to resize.`}
                    aria-keyshortcuts="Enter Space ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight"
                    x={b.map_x}
                    y={b.map_y}
                    width={b.map_width}
                    height={b.map_height}
                    rx={0.8}
                    fill={STATUS_FILL[b.status]}
                    stroke={selectedBoothId === b.id ? "#171514" : zone?.color ?? "#ffffff"}
                    strokeWidth={selectedBoothId === b.id ? 0.8 : 0.4}
                    className="cursor-move outline-none focus-visible:stroke-brand-700 focus-visible:stroke-[1.2]"
                    onKeyDown={(e) => handleBoothKeyDown(e, b)}
                    onKeyUp={(e) => handleBoothKeyUp(e, b)}
                    onPointerDown={(e) =>
                      startDrag(e, b.id, "booth", "move", {
                        x: b.map_x,
                        y: b.map_y,
                        w: b.map_width,
                        h: b.map_height,
                      })
                    }
                  />
                  <text
                    x={b.map_x + b.map_width / 2}
                    y={b.map_y + b.map_height / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={2.4}
                    className="pointer-events-none select-none fill-white font-medium"
                    aria-hidden="true"
                  >
                    {b.booth_number}
                  </text>
                  <rect
                    x={b.map_x + b.map_width - 2.2}
                    y={b.map_y + b.map_height - 2.2}
                    width={2.2}
                    height={2.2}
                    className="cursor-nwse-resize fill-ink-900/70"
                    aria-hidden="true"
                    onPointerDown={(e) =>
                      startDrag(e, b.id, "booth", "resize", {
                        x: b.map_x,
                        y: b.map_y,
                        w: b.map_width,
                        h: b.map_height,
                      })
                    }
                  />
                </g>
              );
            })}
          </svg>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-ink-600">
          {Object.entries(STATUS_FILL).map(([status, color]) => (
            <span key={status} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
              {status.replace(/_/g, " ")}
            </span>
          ))}
        </div>

        {zones.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {zones.map((z) => (
              <span key={z.id} className="flex items-center gap-1.5 rounded-full border border-ink-200 px-2.5 py-1 text-xs text-ink-600">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: z.color }} aria-hidden="true" />
                {z.name}
                <button
                  type="button"
                  className="ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-700"
                  onClick={() =>
                    startTransition(async () => {
                      await deleteZoneAction(z.id, eventId);
                      router.refresh();
                    })
                  }
                  aria-label={`Delete zone ${z.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {localFeatures.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {localFeatures.map((f) => (
              <span key={f.id} className="flex items-center gap-1.5 rounded-full border border-ink-200 px-2.5 py-1 text-xs text-ink-600">
                {f.label || MAP_FEATURE_LABELS[f.type]}
                <button
                  type="button"
                  className="ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-700"
                  onClick={() =>
                    startTransition(async () => {
                      await deleteMapFeatureAction(f.id, eventId);
                      router.refresh();
                    })
                  }
                  aria-label={`Delete map feature ${f.label || MAP_FEATURE_LABELS[f.type]}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        {selectedBooth ? (
          <BoothDetailPanel
            key={selectedBooth.id}
            booth={selectedBooth}
            eventId={eventId}
            zones={zones}
            categories={categories}
            onDuplicate={() => handleDuplicate(selectedBooth.id)}
            onDelete={() => handleDelete(selectedBooth.id)}
            onClose={() => setSelectedBoothId(null)}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-ink-200 p-6 text-center text-sm text-ink-400">
            Select a booth to edit its details, or add a new one.
          </div>
        )}
      </div>

      <ConfirmDialog
        open={zoneFormOpen}
        onOpenChange={setZoneFormOpen}
        title="Add zone"
        confirmLabel="Add"
        onConfirm={() => {
          const form = document.getElementById("zone-form") as HTMLFormElement;
          form?.requestSubmit();
        }}
      >
        <form
          id="zone-form"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            startTransition(async () => {
              const result = await createZoneAction(eventId, formData);
              if (!result.ok) {
                toast({ title: "Couldn't add zone", description: result.error, variant: "error" });
                return;
              }
              setZoneFormOpen(false);
              router.refresh();
            });
          }}
        >
          <Field label="Zone name" htmlFor="zone-name" required>
            <Input id="zone-name" name="name" maxLength={80} placeholder="e.g. Fashion Zone" required />
          </Field>
          <Field label="Zone color" htmlFor="zone-color">
            <Input name="color" type="color" defaultValue="#b8873c" className="h-11 w-20 p-1" />
          </Field>
        </form>
      </ConfirmDialog>

      <ConfirmDialog
        open={featureFormOpen}
        onOpenChange={setFeatureFormOpen}
        title="Add map feature"
        confirmLabel="Add"
        onConfirm={() => {
          const form = document.getElementById("feature-form") as HTMLFormElement;
          form?.requestSubmit();
        }}
      >
        <form
          id="feature-form"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            startTransition(async () => {
              const result = await createMapFeatureAction(eventId, formData);
              if (!result.ok) {
                toast({ title: "Couldn't add feature", description: result.error, variant: "error" });
                return;
              }
              setFeatureFormOpen(false);
              router.refresh();
            });
          }}
        >
          <Field label="Feature type" htmlFor="map-feature-type" required>
            <Select id="map-feature-type" name="type" defaultValue="entrance">
              {Object.entries(MAP_FEATURE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Custom label" htmlFor="map-feature-label" hint="Optional">
            <Input id="map-feature-label" name="label" maxLength={80} placeholder="e.g. Main entrance" />
          </Field>
        </form>
      </ConfirmDialog>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
