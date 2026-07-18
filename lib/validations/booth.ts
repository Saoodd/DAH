import { z } from "zod";

export const boothFormSchema = z.object({
  boothNumber: z.string().trim().min(1, "Booth number is required."),
  sizeLabel: z.string().trim().optional().or(z.literal("")),
  priceBeforeVat: z.number().min(0, "Price cannot be negative."),
  zoneId: z.string().uuid().optional().or(z.literal("")),
  featureTags: z.array(z.string()).default([]),
  suitableCategoryIds: z.array(z.string().uuid()).default([]),
  distanceFromEntrance: z.number().min(0).optional().nullable(),
  adminNotes: z.string().trim().optional().or(z.literal("")),
});

export type BoothFormInput = z.infer<typeof boothFormSchema>;

export const zoneFormSchema = z.object({
  name: z.string().trim().min(1, "Zone name is required."),
  color: z.string().trim().min(1),
  description: z.string().trim().optional().or(z.literal("")),
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
  label: z.string().trim().optional().or(z.literal("")),
});

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
