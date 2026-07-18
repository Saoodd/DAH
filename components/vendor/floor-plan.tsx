"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  lockBoothAction,
  releaseBoothLockAction,
  confirmBoothSelectionAction,
  changeBoothAction,
} from "@/app/vendor/booths/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useSyncedState } from "@/lib/use-synced-state";
import { BOOTH_STATUS_BADGE_COLORS, BOOTH_STATUS_LABELS, MAP_FEATURE_LABELS } from "@/lib/constants";
import { formatAED } from "@/lib/format";
import type { Database } from "@/types/database";

type Booth = Database["public"]["Tables"]["booths"]["Row"];
type Zone = Database["public"]["Tables"]["zones"]["Row"];
type MapFeature = Database["public"]["Tables"]["map_features"]["Row"];

export interface BoothWithRecommendation extends Booth {
  recommended: boolean;
  reasons: string[];
  warning: string | null;
}

const STATUS_FILL: Record<string, string> = {
  available: "#10b981",
  locked: "#f59e0b",
  reserved: "#3b82f6",
  awaiting_payment: "#f97316",
  confirmed: "#7c3aed",
  admin_held: "#64748b",
  blocked: "#dc2626",
  unavailable: "#a3a3a3",
};

interface FloorPlanProps {
  eventId: string;
  businessId: string;
  boothLockMinutes: number;
  initialBooths: BoothWithRecommendation[];
  zones: Zone[];
  mapFeatures: MapFeature[];
  myBoothId: string | null;
  applicationStatus: string;
}

function msRemaining(expiresAt: string | null) {
  return expiresAt ? Math.max(0, new Date(expiresAt).getTime() - Date.now()) : null;
}

function useCountdown(expiresAt: string | null) {
  const [prevExpiresAt, setPrevExpiresAt] = React.useState(expiresAt);
  const [remainingMs, setRemainingMs] = React.useState(() => msRemaining(expiresAt));

  // Reset immediately (render-time) when the deadline itself changes, rather
  // than via an effect — this is a plain derived value, not a subscription.
  if (expiresAt !== prevExpiresAt) {
    setPrevExpiresAt(expiresAt);
    setRemainingMs(msRemaining(expiresAt));
  }

  React.useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => setRemainingMs(msRemaining(expiresAt)), 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return remainingMs;
}

export function FloorPlan({
  eventId,
  businessId,
  boothLockMinutes,
  initialBooths,
  zones,
  mapFeatures,
  myBoothId,
  applicationStatus,
}: FloorPlanProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [booths, setBooths] = useSyncedState(initialBooths);
  const [selectedBoothId, setSelectedBoothId] = React.useState<string | null>(null);
  const [view, setView] = React.useState({ scale: 1, x: 0, y: 0 });
  const [isPending, startTransition] = React.useTransition();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const panState = React.useRef<{ pointerId: number; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const activePointers = React.useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchState = React.useRef<{ distance: number; scale: number } | null>(null);

  const myBooth = booths.find((b) => b.id === myBoothId) ?? null;
  const remainingMs = useCountdown(myBooth?.status === "locked" ? myBooth.lock_expires_at : null);

  React.useEffect(() => {
    if (myBooth?.status === "locked" && remainingMs === 0) {
      router.refresh();
    }
  }, [remainingMs, myBooth, router]);

  React.useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`booths-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "booths", filter: `event_id=eq.${eventId}` },
        (payload) => {
          setBooths((prev) => {
            const updated = payload.new as Booth;
            return prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b));
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, setBooths]);

  function clampScale(scale: number) {
    return Math.min(4, Math.max(0.6, scale));
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setView((v) => ({ ...v, scale: clampScale(v.scale + delta) }));
  }

  function pointerDistance() {
    const points = Array.from(activePointers.current.values());
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  function onPointerDownBackground(e: React.PointerEvent) {
    if ((e.target as Element).closest("[data-booth]")) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 2) {
      panState.current = null;
      pinchState.current = { distance: pointerDistance(), scale: view.scale };
    } else if (activePointers.current.size === 1) {
      panState.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origX: view.x, origY: view.y };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (activePointers.current.size >= 2 && pinchState.current) {
      const distance = pointerDistance();
      if (distance > 0 && pinchState.current.distance > 0) {
        setView((v) => ({ ...v, scale: clampScale(pinchState.current!.scale * (distance / pinchState.current!.distance)) }));
      }
      return;
    }

    if (panState.current && panState.current.pointerId === e.pointerId) {
      const dx = e.clientX - panState.current.startX;
      const dy = e.clientY - panState.current.startY;
      setView((v) => ({ ...v, x: panState.current!.origX + dx, y: panState.current!.origY + dy }));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) pinchState.current = null;
    if (panState.current?.pointerId === e.pointerId) panState.current = null;
  }

  function zoomBy(factor: number) {
    setView((v) => ({ ...v, scale: clampScale(v.scale * factor) }));
  }

  function resetView() {
    setView({ scale: 1, x: 0, y: 0 });
  }

  const selectedBooth = booths.find((b) => b.id === selectedBoothId) ?? null;

  function isMine(booth: Booth) {
    return booth.locked_by_business_id === businessId || booth.id === myBoothId;
  }

  function canSelect(booth: BoothWithRecommendation) {
    if (myBoothId) return false; // must use change flow
    return booth.status === "available";
  }

  function handleSelect(booth: BoothWithRecommendation) {
    startTransition(async () => {
      const result = myBoothId
        ? await changeBoothAction(myBoothId, booth.id, boothLockMinutes)
        : await lockBoothAction(booth.id, boothLockMinutes);
      if (!result.ok) {
        toast({ title: "Couldn't select booth", description: result.error, variant: "error" });
        return;
      }
      toast({ title: `Booth ${booth.booth_number} held for you`, variant: "success" });
      setSelectedBoothId(null);
      router.refresh();
    });
  }

  function handleRelease() {
    if (!myBoothId) return;
    startTransition(async () => {
      const result = await releaseBoothLockAction(myBoothId);
      if (!result.ok) {
        toast({ title: "Couldn't release booth", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Booth released", variant: "success" });
      router.refresh();
    });
  }

  function handleConfirm() {
    if (!myBoothId) return;
    startTransition(async () => {
      const result = await confirmBoothSelectionAction(myBoothId);
      if (!result.ok) {
        toast({ title: "Couldn't confirm", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Selection confirmed — continue to payment", variant: "success" });
      router.refresh();
    });
  }

  const minutes = remainingMs !== null ? Math.floor(remainingMs / 60000) : null;
  const seconds = remainingMs !== null ? Math.floor((remainingMs % 60000) / 1000) : null;

  return (
    <div className="space-y-4">
      {myBooth?.status === "locked" && (
        <div className="sticky top-2 z-20 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Booth {myBooth.booth_number} held for you — {minutes}:{String(seconds).padStart(2, "0")} remaining
            </p>
            <p className="text-xs text-amber-700">Confirm now, or it releases automatically when time runs out.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleRelease} loading={isPending}>
              Release
            </Button>
            <Button size="sm" onClick={handleConfirm} loading={isPending}>
              Confirm selection
            </Button>
          </div>
        </div>
      )}

      {myBooth?.status === "awaiting_payment" && (
        <div className="rounded-2xl border border-orange-300 bg-orange-50 p-4">
          <p className="text-sm font-semibold text-orange-900">Booth {myBooth.booth_number} confirmed — awaiting payment</p>
          <p className="mt-1 text-xs text-orange-700">Head to your dashboard to complete payment once it opens.</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-3 text-xs text-ink-600">
          {Object.entries(STATUS_FILL).map(([status, color]) => (
            <span key={status} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
              {BOOTH_STATUS_LABELS[status]}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border-2 border-brand-500 bg-white" />
            Recommended
          </span>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => zoomBy(1.25)}>
            +
          </Button>
          <Button size="sm" variant="outline" onClick={() => zoomBy(0.8)}>
            −
          </Button>
          <Button size="sm" variant="ghost" onClick={resetView}>
            Reset
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative aspect-square w-full touch-none overflow-hidden rounded-2xl border border-ink-100 bg-ink-50/40"
        onWheel={onWheel}
        onPointerDown={onPointerDownBackground}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div
          className="h-full w-full origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          <svg viewBox="0 0 100 100" className="h-full w-full bg-white">
            {mapFeatures.map((f) => (
              <g key={f.id}>
                <rect x={f.map_x} y={f.map_y} width={f.map_width} height={f.map_height} rx={1} className="fill-ink-200 stroke-ink-400" strokeWidth={0.3} strokeDasharray="1,1" />
                <text x={f.map_x + f.map_width / 2} y={f.map_y + f.map_height / 2} textAnchor="middle" dominantBaseline="middle" fontSize={2.2} className="select-none fill-ink-600">
                  {f.label || MAP_FEATURE_LABELS[f.type]}
                </text>
              </g>
            ))}

            {booths.map((b) => {
              const mine = isMine(b);
              const displayStatus = mine && (b.status === "locked" || b.status === "awaiting_payment") ? b.status : b.status;
              const label = `Booth ${b.booth_number}, ${mine ? "your selection" : BOOTH_STATUS_LABELS[displayStatus] ?? displayStatus}${b.recommended ? ", recommended" : ""}`;
              return (
                <g
                  key={b.id}
                  data-booth
                  onClick={() => setSelectedBoothId(b.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedBoothId(b.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  className="cursor-pointer outline-none focus-visible:opacity-80"
                >
                  <rect
                    x={b.map_x}
                    y={b.map_y}
                    width={b.map_width}
                    height={b.map_height}
                    rx={0.8}
                    fill={mine ? "#7c3aed" : STATUS_FILL[displayStatus]}
                    stroke={b.recommended ? "#b8873c" : "#ffffff"}
                    strokeWidth={b.recommended ? 1 : 0.4}
                  />
                  <text x={b.map_x + b.map_width / 2} y={b.map_y + b.map_height / 2} textAnchor="middle" dominantBaseline="middle" fontSize={2.4} className="pointer-events-none select-none fill-white font-medium" aria-hidden="true">
                    {b.booth_number}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {selectedBooth && (
        <BoothDetailModal
          booth={selectedBooth}
          mine={isMine(selectedBooth)}
          canSelect={canSelect(selectedBooth) || (myBoothId !== null && selectedBooth.status === "available")}
          zoneName={zones.find((z) => z.id === selectedBooth.zone_id)?.name ?? null}
          applicationStatus={applicationStatus}
          isPending={isPending}
          onSelect={() => handleSelect(selectedBooth)}
          onClose={() => setSelectedBoothId(null)}
        />
      )}
    </div>
  );
}

function BoothDetailModal({
  booth,
  mine,
  canSelect,
  zoneName,
  applicationStatus,
  isPending,
  onSelect,
  onClose,
}: {
  booth: BoothWithRecommendation;
  mine: boolean;
  canSelect: boolean;
  zoneName: string | null;
  applicationStatus: string;
  isPending: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const vat = Math.round(booth.price_before_vat * 0.05 * 100) / 100;
  const canInteract = applicationStatus === "approved" || applicationStatus === "booth_selected";
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-ink-950/50" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} tabIndex={-1} className="relative w-full max-w-md rounded-t-2xl bg-white p-6 shadow-2xl outline-none sm:rounded-2xl animate-[var(--animate-scale-in)]">
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-semibold text-ink-950">Booth {booth.booth_number}</h2>
          <Badge className={BOOTH_STATUS_BADGE_COLORS[mine ? "confirmed" : booth.status]}>
            {mine ? "Your selection" : BOOTH_STATUS_LABELS[booth.status]}
          </Badge>
        </div>

        {booth.recommended && (
          <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            Recommended: {booth.reasons.join(", ")}
          </p>
        )}
        {booth.warning && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{booth.warning}</p>}

        <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-ink-400">Size</dt>
          <dd className="text-right text-ink-800">{booth.size_label ?? "—"}</dd>
          <dt className="text-ink-400">Zone</dt>
          <dd className="text-right text-ink-800">{zoneName ?? "—"}</dd>
          <dt className="text-ink-400">Price before VAT</dt>
          <dd className="text-right text-ink-800">{formatAED(booth.price_before_vat)}</dd>
          <dt className="text-ink-400">VAT (5%)</dt>
          <dd className="text-right text-ink-800">{formatAED(vat)}</dd>
          <dt className="font-medium text-ink-600">Total</dt>
          <dd className="text-right font-semibold text-ink-950">{formatAED(booth.price_before_vat + vat)}</dd>
          {booth.distance_from_entrance !== null && (
            <>
              <dt className="text-ink-400">From entrance</dt>
              <dd className="text-right text-ink-800">{booth.distance_from_entrance}m</dd>
            </>
          )}
        </dl>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {!mine && canSelect && canInteract && (
            <Button onClick={onSelect} loading={isPending}>
              Select this booth
            </Button>
          )}
        </div>
        {!canInteract && !mine && (
          <p className="mt-3 text-xs text-ink-400">Booth selection isn&rsquo;t open for your application yet.</p>
        )}
      </div>
    </div>
  );
}
