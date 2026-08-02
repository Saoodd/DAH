import { cn } from "@/lib/utils";

type Shape = "text" | "circle" | "rect";

const shapeClasses: Record<Shape, string> = {
  text: "h-4 w-full rounded-lg",
  circle: "h-10 w-10 rounded-full",
  rect: "rounded-2xl",
};

/**
 * Shimmering placeholder block. Size it with className (`h-24`, `w-56`, …);
 * `shape` picks sensible defaults for text lines, avatars, and card blocks.
 *
 * Skeletons are decorative — give the *container* the loading semantics:
 *
 *   <div aria-busy="true" aria-live="polite">
 *     <span className="sr-only">Loading…</span>
 *     <Skeleton className="h-7 w-56" shape="text" />
 *     <Skeleton className="h-48" />
 *   </div>
 */
export function Skeleton({ shape = "rect", className }: { shape?: Shape; className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton", shapeClasses[shape], className)} />;
}

/** A stack of shimmering text lines; the last line is shortened for realism. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn("skeleton h-4 rounded-lg", lines > 1 && i === lines - 1 ? "w-3/5" : "w-full")}
        />
      ))}
    </div>
  );
}
