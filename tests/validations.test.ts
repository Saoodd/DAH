import { describe, expect, it } from "vitest";
import { signupSchema, loginSchema } from "@/lib/validations/auth";
import { eventFormSchema } from "@/lib/validations/event";

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

const validEvent = {
  name: "Dar Al Hay Autumn Market",
  location: "Dubai Design District",
  description: "",
  vendorRules: "",
  setupInstructions: "",
  startAt: "2026-10-20T10:00:00.000Z",
  endAt: "2026-10-20T20:00:00.000Z",
  setupStartAt: "2026-10-20T07:00:00.000Z",
  setupEndAt: "2026-10-20T09:00:00.000Z",
  registrationOpensAt: "2026-08-01T08:00:00.000Z",
  registrationClosesAt: "2026-10-01T20:00:00.000Z",
  paymentDeadlineMinutes: 60,
  boothLockMinutes: 5,
  recommendationsEnabled: true,
  boothChangesLocked: false,
};

describe("eventFormSchema", () => {
  it("accepts a chronologically valid event", () => {
    expect(eventFormSchema.safeParse(validEvent).success).toBe(true);
  });

  it("rejects invalid or reversed event dates", () => {
    expect(eventFormSchema.safeParse({ ...validEvent, startAt: "not-a-date" }).success).toBe(false);
    expect(
      eventFormSchema.safeParse({ ...validEvent, endAt: "2026-10-20T09:00:00.000Z" }).success
    ).toBe(false);
  });

  it("rejects reversed setup and registration windows", () => {
    expect(
      eventFormSchema.safeParse({ ...validEvent, setupEndAt: "2026-10-20T06:00:00.000Z" }).success
    ).toBe(false);
    expect(
      eventFormSchema.safeParse({
        ...validEvent,
        registrationClosesAt: "2026-07-01T20:00:00.000Z",
      }).success
    ).toBe(false);
  });
});
