const LOCAL_REDIRECT_BASE = "https://local-redirect.invalid";

/**
 * Accepts only same-site, root-relative destinations. Parsing against a fixed
 * origin catches protocol-relative URLs and control-character variants that a
 * simple `startsWith("/")` check can miss.
 */
export function safeLocalRedirect(
  value: string | null | undefined,
  fallback = "/vendor"
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return fallback;
  }

  try {
    const destination = new URL(value, LOCAL_REDIRECT_BASE);
    if (destination.origin !== LOCAL_REDIRECT_BASE) return fallback;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}
