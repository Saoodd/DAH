import { describe, expect, it } from "vitest";
import { signupSchema, loginSchema } from "@/lib/validations/auth";

const validSignup = {
  businessName: "Bunn & Bloom Coffee",
  ownerName: "Fatima Al Marzooqi",
  email: "fatima@example.com",
  phone: "050 123 4567",
  instagramUsername: "bunnandbloom",
  categoryId: "9c858901-8a57-4791-81fe-4c455b099bc9",
  description: "Specialty coffee cart for pop-up events.",
  password: "Passw0rd!",
  confirmPassword: "Passw0rd!",
};

describe("signupSchema", () => {
  it("accepts a valid signup payload", () => {
    expect(signupSchema.safeParse(validSignup).success).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    const result = signupSchema.safeParse({ ...validSignup, confirmPassword: "Different1" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid UAE phone number", () => {
    const result = signupSchema.safeParse({ ...validSignup, phone: "12345" });
    expect(result.success).toBe(false);
  });

  it("rejects a weak password", () => {
    const result = signupSchema.safeParse({ ...validSignup, password: "weak", confirmPassword: "weak" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid category id", () => {
    const result = signupSchema.safeParse({ ...validSignup, categoryId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("requires an email and password", () => {
    expect(loginSchema.safeParse({ email: "", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
  });
});
