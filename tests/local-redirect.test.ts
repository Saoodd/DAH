import { describe, expect, it } from "vitest";
import { safeLocalRedirect } from "@/lib/local-redirect";

describe("safeLocalRedirect", () => {
  it("keeps root-relative paths, query strings, and fragments", () => {
    expect(safeLocalRedirect("/vendor/booths?event=123#map")).toBe(
      "/vendor/booths?event=123#map"
    );
  });

  it("uses the fallback for absent or non-root-relative values", () => {
    expect(safeLocalRedirect(undefined)).toBe("/vendor");
    expect(safeLocalRedirect("admin")).toBe("/vendor");
    expect(safeLocalRedirect("https://example.com/admin")).toBe("/vendor");
  });

  it("rejects protocol-relative and backslash-based external redirects", () => {
    expect(safeLocalRedirect("//example.com/admin")).toBe("/vendor");
    expect(safeLocalRedirect("///example.com/admin")).toBe("/vendor");
    expect(safeLocalRedirect("/\\example.com/admin")).toBe("/vendor");
  });

  it("supports an explicit local fallback", () => {
    expect(safeLocalRedirect("javascript:alert(1)", "/login")).toBe("/login");
  });
});
