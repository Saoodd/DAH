import { z } from "zod";

const requiredDateTime = z
  .string()
  .min(1, "Date and time are required.")
  .refine((value) => !Number.isNaN(Date.parse(value)), "Enter a valid date and time.");

const optionalDateTime = z
  .string()
  .refine((value) => value === "" || !Number.isNaN(Date.parse(value)), "Enter a valid date and time.")
  .optional();

export const eventFormSchema = z
  .object({
    name: z.string().trim().min(2, "Event name is required.").max(120, "Keep the name under 120 characters."),
    location: z.string().trim().max(200, "Keep the location under 200 characters.").optional(),
    description: z.string().trim().max(3000, "Keep the description under 3,000 characters.").optional(),
    vendorRules: z.string().trim().max(10000, "Keep the vendor rules under 10,000 characters.").optional(),
    setupInstructions: z.string().trim().max(10000, "Keep the setup instructions under 10,000 characters.").optional(),
    startAt: requiredDateTime,
    endAt: requiredDateTime,
    setupStartAt: optionalDateTime,
    setupEndAt: optionalDateTime,
    registrationOpensAt: optionalDateTime,
    registrationClosesAt: optionalDateTime,
    paymentDeadlineMinutes: z.number().int().min(5, "Must be at least 5 minutes.").max(10080, "Must be 7 days or less."),
    boothLockMinutes: z.number().int().min(1, "Must be at least 1 minute.").max(120, "Must be 2 hours or less."),
    recommendationsEnabled: z.boolean(),
    boothChangesLocked: z.boolean(),
  })
  .refine((data) => new Date(data.endAt) > new Date(data.startAt), {
    message: "End date/time must be after the start date/time.",
    path: ["endAt"],
  })
  .refine((data) => !data.setupStartAt || !data.setupEndAt || new Date(data.setupEndAt) > new Date(data.setupStartAt), {
    message: "Setup end must be after setup start.",
    path: ["setupEndAt"],
  })
  .refine((data) => !data.registrationOpensAt || !data.registrationClosesAt || new Date(data.registrationClosesAt) > new Date(data.registrationOpensAt), {
    message: "Registration close must be after registration open.",
    path: ["registrationClosesAt"],
  });

export type EventFormInput = z.infer<typeof eventFormSchema>;

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export { slugify };
