import { z } from "zod";

export const bankTransferSchema = z.object({
  transferReference: z.string().trim().min(2, "Enter the transfer reference number."),
  transferDate: z.string().min(1, "Select the transfer date."),
});

export type BankTransferInput = z.infer<typeof bankTransferSchema>;

export const adcbReferenceSchema = z.object({
  paymentReference: z.string().trim().min(2, "Enter the payment reference."),
});

export const MAX_RECEIPT_SIZE_BYTES = 8 * 1024 * 1024;
export const ACCEPTED_RECEIPT_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
