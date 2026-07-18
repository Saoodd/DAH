"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { upsertCategoryRuleAction, deleteCategoryRuleAction } from "@/app/admin/events/[id]/recommendations/actions";
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
      await deleteCategoryRuleAction(rule.id, eventId);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-ink-100 p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-ink-900">{category.name}</p>
        {rule && (
          <Button type="button" size="sm" variant="ghost" onClick={onDelete}>
            Clear rule
          </Button>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-ink-500">Preferred zone</label>
          <Select name="preferredZoneId" defaultValue={rule?.preferred_zone_id ?? ""}>
            <option value="">No preference</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-500">Max booths per zone</label>
          <Input name="maxPerZone" type="number" min={0} defaultValue={rule?.max_per_zone ?? ""} />
        </div>
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-xs text-ink-500">Preferred features</label>
        <div className="flex flex-wrap gap-2">
          {FEATURE_TAG_OPTIONS.map((tag) => (
            <label key={tag} className="flex items-center gap-1.5 text-xs text-ink-600">
              <input
                type="checkbox"
                name="preferredFeatureTags"
                value={tag}
                defaultChecked={rule?.preferred_feature_tags.includes(tag)}
              />
              {FEATURE_TAG_LABELS[tag]}
            </label>
          ))}
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-ink-700">
        <input type="checkbox" name="avoidAdjacent" defaultChecked={rule?.avoid_adjacent_same_category} />
        Avoid placing similar businesses next to each other
      </label>

      <Button type="submit" size="sm" className="mt-3" loading={isPending}>
        Save rule
      </Button>
    </form>
  );
}
