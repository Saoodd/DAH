"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  updateBoothDetailsAction,
  setBoothStatusAction,
  adminHoldBoothAction,
  adminReleaseBoothAction,
  adminAssignBoothAction,
  adminExtendLockAction,
  searchVendorsAction,
  findApplicationForBusinessAction,
  getBoothHistoryAction,
  type BoothHistoryEntry,
} from "@/app/admin/events/[id]/booths/actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { BOOTH_STATUS_BADGE_COLORS, BOOTH_STATUS_LABELS, FEATURE_TAG_LABELS } from "@/lib/constants";
import { FEATURE_TAG_OPTIONS } from "@/lib/validations/booth";
import { formatAED, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type Booth = Database["public"]["Tables"]["booths"]["Row"];
type Zone = Database["public"]["Tables"]["zones"]["Row"];
type Category = { id: string; name: string };

interface BoothDetailPanelProps {
  booth: Booth;
  eventId: string;
  zones: Zone[];
  categories: Category[];
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function BoothDetailPanel({ booth, eventId, zones, categories, onDuplicate, onDelete }: BoothDetailPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = React.useTransition();
  const [tab, setTab] = React.useState<"details" | "status" | "history">("details");
  const [vendorQuery, setVendorQuery] = React.useState("");
  const [vendorResults, setVendorResults] = React.useState<{ id: string; business_name: string; email: string }[]>([]);
  const [history, setHistory] = React.useState<BoothHistoryEntry[] | null>(null);
  const [extendMinutes, setExtendMinutes] = React.useState(10);

  React.useEffect(() => {
    if (tab === "history") {
      getBoothHistoryAction(booth.id).then(setHistory);
    }
  }, [tab, booth.id]);

  function runAction(promise: Promise<{ ok: boolean; error?: string }>, message: string) {
    startTransition(async () => {
      const result = await promise;
      if (!result.ok) {
        toast({ title: "Action failed", description: result.error, variant: "error" });
        return;
      }
      toast({ title: message, variant: "success" });
      router.refresh();
    });
  }

  async function handleVendorSearch(query: string) {
    setVendorQuery(query);
    if (query.length < 2) {
      setVendorResults([]);
      return;
    }
    setVendorResults(await searchVendorsAction(query));
  }

  async function handleHold(businessId: string) {
    runAction(adminHoldBoothAction(booth.id, eventId, businessId), "Booth held for vendor.");
  }

  async function handleAssign(businessId: string) {
    const applicationId = await findApplicationForBusinessAction(eventId, businessId);
    if (!applicationId) {
      toast({ title: "This vendor hasn't applied to this event yet", variant: "error" });
      return;
    }
    runAction(adminAssignBoothAction(booth.id, eventId, applicationId), "Booth reserved.");
  }

  const vat = Math.round(booth.price_before_vat * 0.05 * 100) / 100;
  const safelyUnassigned =
    !booth.current_application_id && ["available", "blocked", "unavailable"].includes(booth.status);
  const canOfferToVendor =
    !booth.current_application_id && ["available", "admin_held"].includes(booth.status);

  return (
    <div className="sticky top-6 rounded-2xl border border-ink-100 bg-white shadow-md">
      <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-4 py-3.5">
        <div>
          <p className="font-display text-h4 text-ink-950">Booth {booth.booth_number}</p>
          <Badge className={cn("mt-1.5", BOOTH_STATUS_BADGE_COLORS[booth.status])}>
            {BOOTH_STATUS_LABELS[booth.status]}
          </Badge>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="outline" onClick={onDuplicate}>
            Duplicate
          </Button>
          <Button size="sm" variant="danger" onClick={onDelete} disabled={!safelyUnassigned} title={!safelyUnassigned ? "Release this booth before deleting it" : undefined}>
            Delete
          </Button>
        </div>
      </div>

      <div className="border-b border-ink-100 px-4 py-2.5">
        <div className="flex gap-1 rounded-lg bg-ink-50 p-1 text-xs font-medium">
          {(["details", "status", "history"] as const).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 capitalize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-700",
                tab === t
                  ? "bg-white font-semibold text-ink-950 shadow-xs"
                  : "text-ink-500 hover:text-ink-800"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-4">
        {tab === "details" && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              runAction(updateBoothDetailsAction(booth.id, eventId, formData), "Booth saved.");
            }}
          >
            <Field label="Booth number" htmlFor="boothNumber" required>
              <Input id="boothNumber" name="boothNumber" defaultValue={booth.booth_number} maxLength={30} required />
            </Field>
            <Field label="Size label" htmlFor="sizeLabel">
              <Input id="sizeLabel" name="sizeLabel" defaultValue={booth.size_label ?? ""} maxLength={50} placeholder="e.g. 3x3m" />
            </Field>
            <Field label="Price before VAT (AED)" htmlFor="priceBeforeVat" required>
              <Input
                id="priceBeforeVat"
                name="priceBeforeVat"
                type="number"
                min={0}
                step="0.01"
                max={99999999.99}
                defaultValue={booth.price_before_vat}
              />
            </Field>
            <p className="flex items-center justify-between rounded-lg bg-ink-50/70 px-3 py-2 text-caption text-ink-500">
              <span>VAT (5%): {formatAED(vat)}</span>
              <span className="font-semibold tabular-nums text-ink-800">
                Total {formatAED(booth.price_before_vat + vat)}
              </span>
            </p>
            <Field label="Zone" htmlFor="zoneId">
              <Select id="zoneId" name="zoneId" defaultValue={booth.zone_id ?? ""}>
                <option value="">No zone</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Distance from entrance (m)" htmlFor="distanceFromEntrance">
              <Input
                id="distanceFromEntrance"
                name="distanceFromEntrance"
                type="number"
                min={0}
                defaultValue={booth.distance_from_entrance ?? ""}
                max={10000}
              />
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink-800">Feature tags</legend>
              <div className="flex flex-wrap gap-1.5">
                {FEATURE_TAG_OPTIONS.map((tag) => (
                  <label
                    key={tag}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-600 shadow-xs transition-colors hover:border-ink-300 has-checked:border-brand-300 has-checked:bg-brand-50 has-checked:text-brand-800"
                  >
                    <input
                      type="checkbox"
                      name="featureTags"
                      value={tag}
                      defaultChecked={booth.feature_tags.includes(tag)}
                      className="h-3.5 w-3.5 rounded border-ink-300 accent-brand-700"
                    />
                    {FEATURE_TAG_LABELS[tag]}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-ink-800">Suitable categories (optional)</legend>
              <p className="mb-2 text-caption text-ink-400">Leave empty to allow any category. Setting any warns other categories.</p>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-600 shadow-xs transition-colors hover:border-ink-300 has-checked:border-brand-300 has-checked:bg-brand-50 has-checked:text-brand-800"
                  >
                    <input
                      type="checkbox"
                      name="suitableCategoryIds"
                      value={c.id}
                      defaultChecked={booth.suitable_category_ids.includes(c.id)}
                      className="h-3.5 w-3.5 rounded border-ink-300 accent-brand-700"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Internal admin notes" htmlFor="adminNotes">
              <Textarea id="adminNotes" name="adminNotes" rows={2} maxLength={2000} defaultValue={booth.admin_notes ?? ""} />
            </Field>
            <Button type="submit" size="sm" loading={isPending}>
              Save
            </Button>
          </form>
        )}

        {tab === "status" && (
          <div className="space-y-5">
            {safelyUnassigned ? (
              <div>
                <p className="mb-2 text-sm font-medium text-ink-800">Set availability</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => runAction(setBoothStatusAction(booth.id, eventId, "available"), "Marked available.")}>
                    Available
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => runAction(setBoothStatusAction(booth.id, eventId, "blocked"), "Marked blocked.")}>
                    Blocked
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => runAction(setBoothStatusAction(booth.id, eventId, "unavailable"), "Marked unavailable.")}>
                    Unavailable
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
                <p className="mb-2.5 text-sm leading-relaxed text-amber-900">
                  Release this hold or assignment before changing the booth&rsquo;s availability.
                </p>
                <Button size="sm" variant="danger" onClick={() => runAction(adminReleaseBoothAction(booth.id, eventId), "Booth released.")}>
                  Release
                </Button>
              </div>
            )}

            {booth.status === "locked" && (
              <div className="flex items-end gap-2">
                <Field label="Extend lock by (minutes)" htmlFor="extendMinutes">
                  <Input
                    id="extendMinutes"
                    type="number"
                    min={1}
                    max={120}
                    step={1}
                    value={extendMinutes}
                    onChange={(e) => setExtendMinutes(Number(e.target.value))}
                  />
                </Field>
                <Button size="sm" onClick={() => runAction(adminExtendLockAction(booth.id, eventId, extendMinutes), "Lock extended.")}>
                  Extend
                </Button>
              </div>
            )}

            {canOfferToVendor && (
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink-800">Hold or assign for a vendor</p>
                <Input placeholder="Search vendor by business name…" value={vendorQuery} onChange={(e) => handleVendorSearch(e.target.value)} />
                {vendorResults.length > 0 && (
                  <ul className="mt-2 max-h-48 divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-100 bg-white shadow-xs">
                    {vendorResults.map((v) => (
                      <li key={v.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors hover:bg-ink-50/60">
                        <span className="truncate font-medium text-ink-800">{v.business_name}</span>
                        <span className="flex shrink-0 gap-1">
                          {booth.status === "available" && (
                            <Button size="sm" variant="ghost" onClick={() => handleHold(v.id)}>
                              Hold
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => handleAssign(v.id)}>
                            Reserve
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "history" && (
          <div>
            {!history ? (
              <p className="text-sm text-ink-400">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-ink-400">No history yet.</p>
            ) : (
              <ol className="space-y-3.5">
                {history.map((entry) => (
                  <li key={entry.id} className="flex gap-3 text-sm">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-300 ring-4 ring-brand-50"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="font-medium capitalize text-ink-800">{entry.event_type.replace(/_/g, " ")}</p>
                      <p className="text-caption text-ink-400">
                        {formatDate(entry.created_at)}
                        {entry.actor_name ? ` · by ${entry.actor_name}` : ""}
                        {entry.business_name ? ` · ${entry.business_name}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
