import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared icon system.
 *
 * All icons are 24×24 outline glyphs drawn with `currentColor` at a 1.75
 * stroke (overridable). Use `<Icon name="…" />` for anything in the registry
 * below; for a one-off glyph, pass the `<path>` element(s) as children and
 * the wrapper still guarantees consistent sizing, stroke, and aria handling:
 *
 *   <Icon name="check" size="sm" />
 *   <Icon className="h-7 w-7"><path d="…" /></Icon>
 *
 * Icons are decorative (`aria-hidden`) by default. Pass `label` when an icon
 * stands alone and carries meaning — it becomes `role="img"` with an
 * accessible name.
 *
 * Add new shared paths here instead of inlining SVG markup in feature code —
 * single `d` strings only, matching the 24×24 / outline / round-cap style.
 */
export const iconPaths = {
  "arrow-right": "M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3",
  bell: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0",
  building:
    "M3.75 21h16.5M4.5 3.75h9a.75.75 0 01.75.75V21H4.5a.75.75 0 01-.75-.75V4.5a.75.75 0 01.75-.75zM13.5 9.75h6a.75.75 0 01.75.75V21h-6.75V9.75zM7.5 7.5h1.5m-1.5 3h1.5m-1.5 3h1.5m6-3h1.5m-1.5 3h1.5",
  calendar:
    "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0V11.25a2.25 2.25 0 012.25-2.25h13.5a2.25 2.25 0 012.25 2.25v7.5",
  check: "m4.5 12.75 6 6 9-13.5",
  "chevron-down": "m19.5 8.25-7.5 7.5-7.5-7.5",
  "chevron-left": "M15.75 19.5 8.25 12l7.5-7.5",
  "chevron-right": "m8.25 4.5 7.5 7.5-7.5 7.5",
  "chevron-up": "m4.5 15.75 7.5-7.5 7.5 7.5",
  "circle-check": "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  "circle-x": "M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  "clipboard-list":
    "M9 12h6m-6 4h6m-7 5h8a2 2 0 002-2V6.5a2 2 0 00-.586-1.414l-2.5-2.5A2 2 0 0013.5 2H8a2 2 0 00-2 2v14a2 2 0 002 2z",
  clock: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
  close: "M6 18L18 6M6 6l12 12",
  "credit-card":
    "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-9-9.75h16.5a1.5 1.5 0 011.5 1.5v9a1.5 1.5 0 01-1.5 1.5H3.75a1.5 1.5 0 01-1.5-1.5v-9a1.5 1.5 0 011.5-1.5z",
  download:
    "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12L12 16.5m0 0L16.5 12M12 16.5V3",
  home: "M2.25 12l8.954-8.955a1.5 1.5 0 012.122 0L21.75 12M4.5 9.75V21a.75.75 0 00.75.75H9.75v-5.25a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21.75h4.5a.75.75 0 00.75-.75V9.75",
  inbox:
    "M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z",
  info: "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z",
  logout:
    "M8.25 9V5.25A2.25 2.25 0 0110.5 3h6a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0116.5 21h-6a2.25 2.25 0 01-2.25-2.25V15M3 12h13.5m0 0l-3.75-3.75M16.5 12l-3.75 3.75",
  map: "M9 6.75L3.75 9v11.25L9 18m0-11.25l6 3m-6-3v11.25m6-8.25l5.25-2.25v11.25L15 20.25m0-11.25v11.25m0-11.25l-6 3",
  menu: "M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5",
  plus: "M12 4.5v15m7.5-7.5h-15",
  search: "m21 21-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
  users:
    "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0112.75 0zM15.75 8.25a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM19.5 8.25a2.25 2.25 0 10-4.5 0 2.25 2.25 0 004.5 0z",
  warning:
    "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
} as const;

export type IconName = keyof typeof iconPaths;

const sizeClasses = {
  xs: "h-3.5 w-3.5",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
} as const;

export interface IconProps extends React.SVGAttributes<SVGSVGElement> {
  /** Registry glyph to render. Omit and pass `<path>` children for one-offs. */
  name?: IconName;
  /** xs 14px · sm 16px · md 20px (default) · lg 24px. Override via className. */
  size?: keyof typeof sizeClasses;
  /** Accessible name for standalone icons. Omit for decorative icons. */
  label?: string;
}

export function Icon({
  name,
  size = "md",
  label,
  className,
  strokeWidth = 1.75,
  children,
  ...props
}: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0", sizeClasses[size], className)}
      {...props}
    >
      {name ? <path d={iconPaths[name]} /> : children}
    </svg>
  );
}
