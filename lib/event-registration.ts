import type { Database } from "@/types/database";

type EventLifecycle = Pick<
  Database["public"]["Tables"]["events"]["Row"],
  "end_at" | "is_archived"
>;

type EventRegistrationWindow = EventLifecycle &
  Pick<
    Database["public"]["Tables"]["events"]["Row"],
    "registration_status" | "registration_opens_at" | "registration_closes_at"
  >;

function parseOptionalDate(value: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

export function isEventActive(event: EventLifecycle, now: Date = new Date()): boolean {
  if (event.is_archived) return false;

  const nowTimestamp = now.getTime();
  const endsAt = parseOptionalDate(event.end_at);
  if (!Number.isFinite(nowTimestamp) || Number.isNaN(endsAt)) return false;

  return endsAt === null || endsAt > nowTimestamp;
}

export function isEventRegistrationOpen(
  event: EventRegistrationWindow,
  now: Date = new Date()
): boolean {
  if (event.registration_status !== "open" || !isEventActive(event, now)) return false;

  const nowTimestamp = now.getTime();
  if (!Number.isFinite(nowTimestamp)) return false;

  const opensAt = parseOptionalDate(event.registration_opens_at);
  const closesAt = parseOptionalDate(event.registration_closes_at);

  if ([opensAt, closesAt].some(Number.isNaN)) return false;
  if (opensAt !== null && opensAt > nowTimestamp) return false;
  if (closesAt !== null && closesAt <= nowTimestamp) return false;

  return true;
}
