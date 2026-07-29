import { z } from "zod";

export const FEATURE_TAG_OPTIONS = [
  "near_entrance",
  "near_seating",
  "near_electrical",
  "food_area",
  "clothing_zone",
  "coffee_area",
  "high_traffic",
  "corner",
] as const;

export const boothFormSchema = z.object({
  boothNumber: z.string().trim().min(1, "Booth number is required.").max(30, "Keep the booth number under 30 characters."),
  sizeLabel: z.string().trim().max(50, "Keep the size label under 50 characters.").optional().or(z.literal("")),
  priceBeforeVat: z.number().finite().min(0, "Price cannot be negative.").max(99_999_999.99, "Price is too large."),
  zoneId: z.string().uuid().optional().or(z.literal("")),
  featureTags: z.array(z.enum(FEATURE_TAG_OPTIONS)).max(FEATURE_TAG_OPTIONS.length).default([]),
  suitableCategoryIds: z.array(z.string().uuid()).max(100).default([]),
  distanceFromEntrance: z.number().finite().min(0).max(10_000).optional().nullable(),
  adminNotes: z.string().trim().max(2_000, "Keep notes under 2,000 characters.").optional().or(z.literal("")),
});

export type BoothFormInput = z.infer<typeof boothFormSchema>;

export const zoneFormSchema = z.object({
  name: z.string().trim().min(1, "Zone name is required.").max(80, "Keep the zone name under 80 characters."),
  color: z.string().trim().regex(/^#[0-9a-f]{6}$/i, "Choose a valid six-digit colour."),
  description: z.string().trim().max(500, "Keep the description under 500 characters.").optional().or(z.literal("")),
});

export const mapFeatureFormSchema = z.object({
  type: z.enum([
    "entrance",
    "exit",
    "loading_bay",
    "main_stage",
    "food_section",
    "clothing_section",
    "coffee_area",
    "electrical_point",
    "restroom",
    "other",
  ]),
  label: z.string().trim().max(80, "Keep the label under 80 characters.").optional().or(z.literal("")),
});
