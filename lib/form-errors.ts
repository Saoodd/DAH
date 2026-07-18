import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

/**
 * Maps a server action's field-level errors onto a React Hook Form instance
 * and focuses/scrolls to the first invalid field. Field names must match the
 * `id` attribute of their corresponding input (the convention used
 * throughout this codebase via `<Field htmlFor="x"><Input id="x" .../>`).
 *
 * Returns true if any field errors were applied, so callers can decide
 * whether to also show a generic banner for non-field errors.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  fieldErrors: Record<string, string[] | undefined> | undefined
): boolean {
  if (!fieldErrors) return false;

  const entries = Object.entries(fieldErrors).filter(
    (entry): entry is [string, string[]] => !!entry[1] && entry[1].length > 0
  );
  if (entries.length === 0) return false;

  for (const [name, messages] of entries) {
    setError(name as Path<T>, { type: "server", message: messages[0] });
  }

  focusAndScrollToField(entries[0][0]);
  return true;
}

function focusAndScrollToField(name: string) {
  requestAnimationFrame(() => {
    const el = document.getElementById(name);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus({ preventScroll: true });
    }
  });
}
