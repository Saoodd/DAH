export function formatAED(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  const formatted = new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    currencyDisplay: "code",
    minimumFractionDigits: 2,
  }).format(amount);
  // Intl inserts a non-breaking space between "AED" and the number in some
  // runtimes; normalize to a regular space for predictable rendering/testing.
  return formatted.replace(/ /g, " ");
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dubai",
  }).format(date);
}

export function formatDateOnly(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AE", {
    dateStyle: "medium",
    timeZone: "Asia/Dubai",
  }).format(date);
}

/** Normalizes a UAE number to +9715XXXXXXXX / +97142XXXXXX form for storage. */
export function normalizeUaePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  let local = digits;
  if (local.startsWith("+971")) local = local.slice(4);
  else if (local.startsWith("00971")) local = local.slice(5);
  else if (local.startsWith("971")) local = local.slice(3);
  else if (local.startsWith("0")) local = local.slice(1);
  return `+971${local}`;
}

export function formatUaePhoneDisplay(raw: string): string {
  const normalized = normalizeUaePhone(raw);
  const local = normalized.slice(4);
  if (local.length === 9) {
    return `${normalized.slice(0, 4)} ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
  }
  return normalized;
}
