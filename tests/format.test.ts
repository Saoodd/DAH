import { describe, expect, it } from "vitest";
import { formatAED, normalizeUaePhone, formatUaePhoneDisplay } from "@/lib/format";

describe("formatAED", () => {
  it("formats a number as AED currency", () => {
    expect(formatAED(1500)).toBe("AED 1,500.00");
  });

  it("returns an em dash for null/undefined", () => {
    expect(formatAED(null)).toBe("—");
    expect(formatAED(undefined)).toBe("—");
  });
});

describe("normalizeUaePhone", () => {
  it("normalizes local format", () => {
    expect(normalizeUaePhone("0501234567")).toBe("+971501234567");
  });

  it("normalizes 00971 prefix", () => {
    expect(normalizeUaePhone("00971501234567")).toBe("+971501234567");
  });

  it("normalizes +971 prefix", () => {
    expect(normalizeUaePhone("+971 50 123 4567")).toBe("+971501234567");
  });

  it("normalizes bare 971 prefix", () => {
    expect(normalizeUaePhone("971501234567")).toBe("+971501234567");
  });
});

describe("formatUaePhoneDisplay", () => {
  it("groups digits for readability", () => {
    expect(formatUaePhoneDisplay("0501234567")).toBe("+971 50 123 4567");
  });
});
