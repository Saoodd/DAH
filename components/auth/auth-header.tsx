import { cn } from "@/lib/utils";

/**
 * Shared intro block for auth pages: an uppercase eyebrow, a serif display
 * heading, and supporting copy — rendered above the form card so every auth
 * page opens with the same editorial treatment as the marketing site.
 */
export function AuthHeader({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-8", className)}>
      {eyebrow && (
        <p className="mb-3 text-caption font-semibold uppercase tracking-[0.14em] text-brand-700">{eyebrow}</p>
      )}
      <h1 className="font-display text-h2 text-balance text-ink-950">{title}</h1>
      {description && <p className="mt-2.5 text-body-sm text-ink-500">{description}</p>}
    </header>
  );
}
