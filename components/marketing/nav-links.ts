/**
 * Marketing navigation links, shared between the desktop navbar (server
 * component) and the mobile menu (client component). Kept in a plain module
 * so neither side pulls the other across the server/client boundary.
 */
export const NAV_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#for-vendors", label: "For vendors" },
] as const;
