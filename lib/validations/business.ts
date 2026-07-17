import { z } from "zod";
import { UAE_PHONE_REGEX } from "@/lib/constants";

export const businessProfileSchema = z.object({
  businessName: z.string().trim().min(2, "Business name is required."),
  ownerName: z.string().trim().min(2, "Owner's full name is required."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => UAE_PHONE_REGEX.test(v), "Enter a valid UAE phone number."),
  instagramUsername: z
    .string()
    .trim()
    .regex(/^@?[A-Za-z0-9._]{1,30}$/, "Enter a valid Instagram username.")
    .optional()
    .or(z.literal("")),
  categoryId: z.string().uuid("Select a business category."),
  description: z
    .string()
    .trim()
    .min(10, "Add a short description (at least 10 characters).")
    .max(600, "Keep the description under 600 characters."),
});

export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;

export const MAX_LOGO_SIZE_BYTES = 3 * 1024 * 1024;
export const MAX_LICENSE_SIZE_BYTES = 8 * 1024 * 1024;
export const MAX_PRODUCT_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_PRODUCT_PHOTOS = 6;

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const ACCEPTED_DOCUMENT_TYPES = [...ACCEPTED_IMAGE_TYPES, "application/pdf"];
