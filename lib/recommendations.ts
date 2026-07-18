import { FEATURE_TAG_LABELS } from "@/lib/constants";
import type { Database } from "@/types/database";

type Booth = Database["public"]["Tables"]["booths"]["Row"];
type CategoryRule = Database["public"]["Tables"]["category_zone_rules"]["Row"];

export interface BoothRecommendation {
  recommended: boolean;
  reasons: string[];
  warning: string | null;
}

const ADJACENCY_THRESHOLD = 15; // canvas units (0-100 scale); "nearby" for avoid-adjacent checks

function boothCenter(booth: Pick<Booth, "map_x" | "map_y" | "map_width" | "map_height">) {
  return { x: booth.map_x + booth.map_width / 2, y: booth.map_y + booth.map_height / 2 };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Rule-based (no AI) recommendation for a single booth, given the vendor's
 * category, the admin-configured rule for that category/event (if any), and
 * which categories currently occupy nearby booths (for the "avoid adjacent
 * same category" rule). Recommendations are additive signals shown to the
 * vendor — nothing here blocks a selection; see FEATURE_TAG_LABELS for the
 * human-readable reason text.
 */
export function getBoothRecommendation(
  booth: Booth,
  categoryId: string | null,
  rule: CategoryRule | null,
  nearbyOccupants: { boothId: string; categoryId: string | null }[],
  recommendationsEnabled: boolean
): BoothRecommendation {
  if (!recommendationsEnabled || !categoryId) {
    return { recommended: false, reasons: [], warning: null };
  }

  const reasons: string[] = [];

  if (rule?.preferred_zone_id && booth.zone_id === rule.preferred_zone_id) {
    reasons.push("In your preferred zone");
  }

  const matchingTags = (rule?.preferred_feature_tags ?? []).filter((tag) => booth.feature_tags.includes(tag));
  for (const tag of matchingTags) {
    reasons.push(FEATURE_TAG_LABELS[tag] ?? tag);
  }

  if (booth.suitable_category_ids.length > 0 && booth.suitable_category_ids.includes(categoryId)) {
    reasons.push("Marked suitable for your category");
  }

  let warning: string | null = null;

  if (booth.suitable_category_ids.length > 0 && !booth.suitable_category_ids.includes(categoryId)) {
    warning = "This booth is marked for other business categories.";
  }

  if (rule?.avoid_adjacent_same_category) {
    const center = boothCenter(booth);
    const hasNearbySameCategory = nearbyOccupants.some((occupant) => {
      if (occupant.boothId === booth.id || occupant.categoryId !== categoryId) return false;
      return true; // pre-filtered to within threshold by the caller
    });
    if (hasNearbySameCategory) {
      warning = warning
        ? `${warning} A similar business is already nearby.`
        : "A similar business is already nearby.";
    }
    void center; // distance filtering happens in getNearbyOccupants below
  }

  return { recommended: reasons.length > 0, reasons, warning };
}

/** Returns occupant categories for booths within ADJACENCY_THRESHOLD of the given booth. */
export function getNearbyOccupants(
  booth: Booth,
  allBooths: Booth[],
  occupantCategoryByBoothId: Map<string, string | null>
): { boothId: string; categoryId: string | null }[] {
  const center = boothCenter(booth);
  return allBooths
    .filter((b) => b.id !== booth.id && occupantCategoryByBoothId.has(b.id))
    .filter((b) => distance(center, boothCenter(b)) <= ADJACENCY_THRESHOLD)
    .map((b) => ({ boothId: b.id, categoryId: occupantCategoryByBoothId.get(b.id) ?? null }));
}
