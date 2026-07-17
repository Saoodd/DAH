import { z } from "zod";

export const eventFormSchema = z
  .object({
    name: z.string().trim().min(2, "Event name is required."),
    location: z.string().trim().optional().or(z.literal("")),
    description: z.string().trim().optional().or(z.literal("")),
    vendorRules: z.string().trim().optional().or(z.literal("")),
    setupInstructions: z.string().trim().optional().or(z.literal("")),
    startAt: z.string().min(1, "Start date/time is required."),
    endAt: z.string().min(1, "End date/time is required."),
    setupStartAt: z.string().optional().or(z.literal("")),
    setupEndAt: z.string().optional().or(z.literal("")),
    registrationOpensAt: z.string().optional().or(z.literal("")),
    registrationClosesAt: z.string().optional().or(z.literal("")),
    paymentDeadlineMinutes: z.number().int().min(5, "Must be at least 5 minutes.").max(10080),
    boothLockMinutes: z.number().int().min(1, "Must be at least 1 minute.").max(120),
    recommendationsEnabled: z.boolean(),
    boothChangesLocked: z.boolean(),
  })
  .refine((data) => new Date(data.endAt) > new Date(data.startAt), {
    message: "End date/time must be after the start date/time.",
    path: ["endAt"],
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
