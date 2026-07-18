import { describe, expect, it } from "vitest";
import { getBoothRecommendation, getNearbyOccupants } from "@/lib/recommendations";
import type { Database } from "@/types/database";

type Booth = Database["public"]["Tables"]["booths"]["Row"];
type CategoryRule = Database["public"]["Tables"]["category_zone_rules"]["Row"];

const COFFEE_CATEGORY = "cat-coffee";
const CLOTHING_CATEGORY = "cat-clothing";

function makeBooth(overrides: Partial<Booth> = {}): Booth {
  return {
    id: "booth-1",
    event_id: "event-1",
    zone_id: null,
    booth_number: "B001",
    size_label: "3x3",
    map_x: 10,
    map_y: 10,
    map_width: 5,
    map_height: 5,
    rotation: 0,
    price_before_vat: 500,
    status: "available",
    feature_tags: [],
    distance_from_entrance: null,
    suitable_category_ids: [],
    admin_notes: null,
    held_for_business_id: null,
    locked_by_business_id: null,
    lock_expires_at: null,
    current_application_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeRule(overrides: Partial<CategoryRule> = {}): CategoryRule {
  return {
    id: "rule-1",
    event_id: "event-1",
    category_id: COFFEE_CATEGORY,
    preferred_zone_id: null,
    preferred_feature_tags: [],
    avoid_adjacent_same_category: false,
    max_per_zone: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("getBoothRecommendation", () => {
  it("recommends nothing when recommendations are disabled for the event", () => {
    const booth = makeBooth({ zone_id: "zone-1" });
    const rule = makeRule({ preferred_zone_id: "zone-1" });
    const result = getBoothRecommendation(booth, COFFEE_CATEGORY, rule, [], false);
    expect(result.recommended).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it("recommends a booth in the preferred zone", () => {
    const booth = makeBooth({ zone_id: "zone-1" });
    const rule = makeRule({ preferred_zone_id: "zone-1" });
    const result = getBoothRecommendation(booth, COFFEE_CATEGORY, rule, [], true);
    expect(result.recommended).toBe(true);
    expect(result.reasons).toContain("In your preferred zone");
  });

  it("recommends a booth matching a preferred feature tag", () => {
    const booth = makeBooth({ feature_tags: ["near_seating", "near_electrical"] });
    const rule = makeRule({ preferred_feature_tags: ["near_seating"] });
    const result = getBoothRecommendation(booth, COFFEE_CATEGORY, rule, [], true);
    expect(result.recommended).toBe(true);
    expect(result.reasons).toContain("Near seating");
  });

  it("does not recommend when no rule matches", () => {
    const booth = makeBooth({ zone_id: "zone-2" });
    const rule = makeRule({ preferred_zone_id: "zone-1" });
    const result = getBoothRecommendation(booth, COFFEE_CATEGORY, rule, [], true);
    expect(result.recommended).toBe(false);
    expect(result.warning).toBeNull();
  });

  it("warns (but does not block) when the booth is restricted to other categories", () => {
    const booth = makeBooth({ suitable_category_ids: [CLOTHING_CATEGORY] });
    const result = getBoothRecommendation(booth, COFFEE_CATEGORY, null, [], true);
    expect(result.recommended).toBe(false);
    expect(result.warning).toMatch(/other business categories/i);
  });

  it("recommends when the booth explicitly lists the vendor's category as suitable", () => {
    const booth = makeBooth({ suitable_category_ids: [COFFEE_CATEGORY] });
    const result = getBoothRecommendation(booth, COFFEE_CATEGORY, null, [], true);
    expect(result.recommended).toBe(true);
    expect(result.warning).toBeNull();
  });

  it("warns when a same-category business is already nearby and the rule requires avoiding it", () => {
    const booth = makeBooth();
    const rule = makeRule({ avoid_adjacent_same_category: true });
    const nearby = [{ boothId: "booth-2", categoryId: COFFEE_CATEGORY }];
    const result = getBoothRecommendation(booth, COFFEE_CATEGORY, rule, nearby, true);
    expect(result.warning).toMatch(/similar business is already nearby/i);
  });
});

describe("getNearbyOccupants", () => {
  it("only returns occupied booths within the adjacency threshold", () => {
    const target = makeBooth({ id: "target", map_x: 0, map_y: 0, map_width: 5, map_height: 5 });
    const near = makeBooth({ id: "near", map_x: 5, map_y: 0, map_width: 5, map_height: 5 });
    const far = makeBooth({ id: "far", map_x: 90, map_y: 90, map_width: 5, map_height: 5 });

    const occupants = new Map<string, string | null>([
      ["near", COFFEE_CATEGORY],
      ["far", COFFEE_CATEGORY],
    ]);

    const result = getNearbyOccupants(target, [target, near, far], occupants);
    expect(result.map((r) => r.boothId)).toEqual(["near"]);
  });

  it("excludes the booth itself even if it appears in the occupant map", () => {
    const target = makeBooth({ id: "target" });
    const occupants = new Map<string, string | null>([["target", COFFEE_CATEGORY]]);
    const result = getNearbyOccupants(target, [target], occupants);
    expect(result).toHaveLength(0);
  });
});
