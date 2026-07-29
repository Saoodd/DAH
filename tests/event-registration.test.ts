import { describe, expect, it } from "vitest";
import { isEventActive, isEventRegistrationOpen } from "@/lib/event-registration";

const now = new Date("2026-07-28T12:00:00.000Z");

function event(overrides: Partial<Parameters<typeof isEventRegistrationOpen>[0]> = {}) {
  return {
    registration_status: "open" as const,
    registration_opens_at: null,
    registration_closes_at: null,
    end_at: "2026-07-30T12:00:00.000Z",
    is_archived: false,
    ...overrides,
  };
}

describe("isEventRegistrationOpen", () => {
  it("accepts an open, current, non-archived event", () => {
    expect(isEventRegistrationOpen(event(), now)).toBe(true);
  });

  it("allows registration exactly at the scheduled opening time", () => {
    expect(
      isEventRegistrationOpen(
        event({ registration_opens_at: now.toISOString() }),
        now
      )
    ).toBe(true);
  });

  it("rejects registration before the scheduled opening time", () => {
    expect(
      isEventRegistrationOpen(
        event({ registration_opens_at: "2026-07-28T12:00:00.001Z" }),
        now
      )
    ).toBe(false);
  });

  it("closes registration exactly at the scheduled closing time", () => {
    expect(
      isEventRegistrationOpen(
        event({ registration_closes_at: now.toISOString() }),
        now
      )
    ).toBe(false);
  });

  it("rejects ended and archived events", () => {
    expect(isEventRegistrationOpen(event({ end_at: now.toISOString() }), now)).toBe(false);
    expect(isEventRegistrationOpen(event({ is_archived: true }), now)).toBe(false);
  });

  it("distinguishes an active event from an open registration window", () => {
    expect(
      isEventActive(event({ registration_status: "closed" }), now)
    ).toBe(true);
    expect(
      isEventActive(event({ registration_closes_at: now.toISOString() }), now)
    ).toBe(true);
    expect(isEventActive(event({ end_at: now.toISOString() }), now)).toBe(false);
  });

  it("rejects events whose explicit status is not open", () => {
    expect(
      isEventRegistrationOpen(event({ registration_status: "closed" }), now)
    ).toBe(false);
  });

  it("fails closed for malformed timestamps or an invalid clock", () => {
    expect(
      isEventRegistrationOpen(event({ registration_closes_at: "not-a-date" }), now)
    ).toBe(false);
    expect(isEventRegistrationOpen(event(), new Date("invalid"))).toBe(false);
  });
});
