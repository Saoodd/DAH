"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { upsertCategoryRuleAction, deleteCategoryRuleAction } from "@/app/admin/events/[id]/recommendations/actions";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { FEATURE_TAG_LABELS } from "@/lib/constants";
import { FEATURE_TAG_OPTIONS } from "@/lib/validations/booth";
import type { Database } from "@/types/database";

type Zone = Database["public"]["Tables"]["zones"]["Row"];
type Rule = Database["public"]["Tables"]["category_zone_rules"]["Row"];

export function CategoryRuleRow({
  eventId,
  category,
  zones,
  rule,
}: {
  eventId: string;
  category: { id: string; name: string };
  zones: Zone[];
  rule: Rule | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = React.useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await upsertCategoryRuleAction(eventId, category.id, formData);
      if (!result.ok) {
        toast({ title: "Couldn't save rule", description: result.error, variant: "error" });
        return;
      }
      toast({ title: `Rule saved for ${category.name}`, variant: "success" });
      router.refresh();
    });
  }

  function onDelete() {
    if (!rule) return;
    startTransition(async () => {
      const result = await deleteCategoryRuleAction(rule.id, eventId);
      if (!result.ok) {
        toast({ title: "Couldn't clear rule", description: result.error, variant: "error" });
        return;
      }
      toast({ title: `Rule cleared for ${category.name}`, variant: "success" });
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col rounded-2xl border border-ink-100 bg-white p-5 shadow-sm transition-shadow duration-200"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <p className="truncate font-semibold text-ink-900">{category.name}</p>
          {rule && <Badge className="border-brand-200 bg-brand-50 text-brand-700">Rule active</Badge>}
        </div>
        {rule && (
          <Button type="button" size="sm" variant="ghost" onClick={onDelete}>
            Clear rule
          </Button>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor={`preferred-zone-${category.id}`}
            className="mb-1.5 block text-caption font-medium uppercase tracking-wide text-ink-400"
          >
            Preferred zone
          </label>
          <Select id={`preferred-zone-${category.id}`} name="preferredZoneId" defaultValue={rule?.preferred_zone_id ?? ""}>
            <option value="">No preference</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label
            htmlFor={`max-per-zone-${category.id}`}
            className="mb-1.5 block text-caption font-medium uppercase tracking-wide text-ink-400"
          >
            Max booths per zone
          </label>
          <Input
            id={`max-per-zone-${category.id}`}
            name="maxPerZone"
            type="number"
            min={1}
            max={10000}
            step={1}
            className="tabular-nums"
            placeholder="No limit"
            defaultValue={rule?.max_per_zone ?? ""}
          />
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="mb-2 block text-caption font-medium uppercase tracking-wide text-ink-400">
          Preferred features
        </legend>
        <div className="flex flex-wrap gap-2">
          {FEATURE_TAG_OPTIONS.map((tag) => (
            <label
              key={tag}
              className="flex cursor-pointer select-none items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:border-ink-300 hover:bg-ink-50 has-checked:border-brand-300 has-checked:bg-brand-50 has-checked:text-brand-800"
            >
              <input
                type="checkbox"
                name="preferredFeatureTags"
                value={tag}
                defaultChecked={rule?.preferred_feature_tags.includes(tag)}
                className="h-3.5 w-3.5 rounded border-ink-300 accent-brand-700"
              />
              {FEATURE_TAG_LABELS[tag]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-4 flex cursor-pointer select-none items-center gap-2.5 rounded-xl border border-ink-100 bg-ink-50/50 px-3.5 py-3 text-sm text-ink-700 transition-colors hover:bg-ink-50">
        <input
          type="checkbox"
          name="avoidAdjacent"
          defaultChecked={rule?.avoid_adjacent_same_category}
          className="h-4 w-4 rounded border-ink-300 accent-brand-700"
        />
        Avoid placing similar businesses next to each other
      </label>

      <div className="mt-4 flex justify-end border-t border-ink-100 pt-4">
        <Button type="submit" size="sm" loading={isPending}>
          Save rule
        </Button>
      </div>
    </form>
  );
}
