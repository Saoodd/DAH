const PUBLIC_URL_MARKER = "__dah_storage_object_path__";
const UUID_SEGMENT = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const OWNED_OBJECT_PATH = new RegExp(
  `^(${UUID_SEGMENT})/(${UUID_SEGMENT})-[A-Za-z0-9._-]{0,80}$`,
  "i"
);

export function isOwnedStorageObjectPath(path: string, ownerId?: string): boolean {
  const match = OWNED_OBJECT_PATH.exec(path);
  if (!match) return false;
  return ownerId === undefined || match[1].toLowerCase() === ownerId.toLowerCase();
}

export function shouldRemoveSupersededStorageObject(
  previousPath: string | null,
  nextPath: string,
  ownerId?: string
): previousPath is string {
  return (
    previousPath !== null &&
    previousPath !== nextPath &&
    isOwnedStorageObjectPath(previousPath, ownerId)
  );
}

/**
 * Resolves an app-owned object path from a public Supabase Storage URL.
 * The reference URL must be generated for PUBLIC_URL_MARKER by the active
 * Supabase client, which pins the accepted origin and bucket prefix.
 */
export function ownedStoragePathFromPublicUrl(
  publicUrl: string | null,
  referenceUrl: string,
  ownerId?: string
): string | null {
  if (!publicUrl) return null;

  try {
    const candidate = new URL(publicUrl);
    const reference = new URL(referenceUrl);
    if (
      candidate.origin !== reference.origin ||
      candidate.username ||
      candidate.password ||
      candidate.search ||
      candidate.hash ||
      !reference.pathname.endsWith(PUBLIC_URL_MARKER)
    ) {
      return null;
    }

    const expectedPrefix = reference.pathname.slice(0, -PUBLIC_URL_MARKER.length);
    if (!candidate.pathname.startsWith(expectedPrefix)) return null;

    const path = decodeURIComponent(candidate.pathname.slice(expectedPrefix.length));
    return isOwnedStorageObjectPath(path, ownerId) ? path : null;
  } catch {
    return null;
  }
}

export { PUBLIC_URL_MARKER };
