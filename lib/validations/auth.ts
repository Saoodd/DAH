import { z } from "zod";
import { UAE_PHONE_REGEX } from "@/lib/constants";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .regex(/[a-zA-Z]/, "Password must contain at least one letter.")
  .regex(/[0-9]/, "Password must contain at least one number.");

export const signupSchema = z
  .object({
    businessName: z.string().trim().min(2, "Business name is required."),
    ownerName: z.string().trim().min(2, "Owner's full name is required."),
    email: z.string().trim().toLowerCase().email("Enter a valid email address."),
    phone: z
      .string()
      .trim()
      .transform((v) => v.replace(/[\s-]/g, ""))
      .refine((v) => UAE_PHONE_REGEX.test(v), "Enter a valid UAE phone number, e.g. 050 123 4567."),
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
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
