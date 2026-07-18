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

  async function handleAssign(businessId: string, status: "reserved" | "confirmed") {
    const applicationId = await findApplicationForBusinessAction(eventId, businessId);
    if (!applicationId) {
      toast({ title: "This vendor hasn't applied to this event yet", variant: "error" });
      return;
    }
    runAction(adminAssignBoothAction(booth.id, eventId, applicationId, status), `Booth ${status}.`);
  }

  const vat = Math.round(booth.price_before_vat * 0.05 * 100) / 100;

  return (
    <div className="sticky top-6 rounded-2xl border border-ink-100 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
        <div>
          <p className="font-semibold text-ink-900">Booth {booth.booth_number}</p>
          <Badge className={BOOTH_STATUS_BADGE_COLORS[booth.status]}>{BOOTH_STATUS_LABELS[booth.status]}</Badge>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={onDuplicate}>
            Duplicate
          </Button>
          <Button size="sm" variant="danger" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>

      <div className="flex border-b border-ink-100 text-xs font-medium">
        {(["details", "status", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-2 capitalize ${tab === t ? "border-b-2 border-ink-900 text-ink-900" : "text-ink-400"}`}
          >
            {t}
          </button>
        ))}
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
              <Input id="boothNumber" name="boothNumber" defaultValue={booth.booth_number} required />
            </Field>
            <Field label="Size label" htmlFor="sizeLabel">
              <Input id="sizeLabel" name="sizeLabel" defaultValue={booth.size_label ?? ""} placeholder="e.g. 3x3m" />
            </Field>
            <Field label="Price before VAT (AED)" htmlFor="priceBeforeVat" required>
              <Input
                id="priceBeforeVat"
                name="priceBeforeVat"
                type="number"
                min={0}
                step="0.01"
                defaultValue={booth.price_before_vat}
              />
            </Field>
            <p className="text-xs text-ink-400">
              VAT (5%): {formatAED(vat)} · Total: {formatAED(booth.price_before_vat + vat)}
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
              />
            </Field>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-ink-800">Feature tags</legend>
              <div className="flex flex-wrap gap-2">
                {FEATURE_TAG_OPTIONS.map((tag) => (
                  <label key={tag} className="flex items-center gap-1.5 text-xs text-ink-600">
                    <input type="checkbox" name="featureTags" value={tag} defaultChecked={booth.feature_tags.includes(tag)} />
                    {FEATURE_TAG_LABELS[tag]}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-ink-800">Suitable categories (optional)</legend>
              <p className="mb-1.5 text-xs text-ink-400">Leave empty to allow any category. Setting any warns other categories.</p>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-xs text-ink-600">
                    <input
                      type="checkbox"
                      name="suitableCategoryIds"
                      value={c.id}
                      defaultChecked={booth.suitable_category_ids.includes(c.id)}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Internal admin notes" htmlFor="adminNotes">
              <Textarea id="adminNotes" name="adminNotes" rows={2} defaultValue={booth.admin_notes ?? ""} />
            </Field>
            <Button type="submit" size="sm" loading={isPending}>
              Save
            </Button>
          </form>
        )}

        {tab === "status" && (
          <div className="space-y-5">
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
              <Button size="sm" variant="danger" onClick={() => runAction(adminReleaseBoothAction(booth.id, eventId), "Booth released.")}>
                Release
              </Button>
            </div>

            {booth.status === "locked" && (
              <div className="flex items-end gap-2">
                <Field label="Extend lock by (minutes)" htmlFor="extendMinutes">
                  <Input
                    id="extendMinutes"
                    type="number"
                    min={1}
                    value={extendMinutes}
                    onChange={(e) => setExtendMinutes(Number(e.target.value))}
                  />
                </Field>
                <Button size="sm" onClick={() => runAction(adminExtendLockAction(booth.id, eventId, extendMinutes), "Lock extended.")}>
                  Extend
                </Button>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-sm font-medium text-ink-800">Hold or assign for a vendor</p>
              <Input placeholder="Search vendor by business name…" value={vendorQuery} onChange={(e) => handleVendorSearch(e.target.value)} />
              {vendorResults.length > 0 && (
                <ul className="mt-2 max-h-48 divide-y divide-ink-100 overflow-y-auto rounded-lg border border-ink-100">
                  {vendorResults.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="truncate">{v.business_name}</span>
                      <span className="flex shrink-0 gap-1">
                        <Button size="sm" variant="ghost" onClick={() => handleHold(v.id)}>
                          Hold
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleAssign(v.id, "reserved")}>
                          Reserve
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleAssign(v.id, "confirmed")}>
                          Confirm
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {tab === "history" && (
          <div>
            {!history ? (
              <p className="text-sm text-ink-400">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-ink-400">No history yet.</p>
            ) : (
              <ul className="space-y-3">
                {history.map((entry) => (
                  <li key={entry.id} className="text-sm">
                    <p className="font-medium text-ink-800">{entry.event_type.replace(/_/g, " ")}</p>
                    <p className="text-xs text-ink-400">
                      {formatDate(entry.created_at)}
                      {entry.actor_name ? ` · by ${entry.actor_name}` : ""}
                      {entry.business_name ? ` · ${entry.business_name}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
