import { Icon } from "@/components/ui/icon";

// Navigation icons used by the admin/vendor dashboard shells. These delegate
// to the shared registry in components/ui/icon.tsx — add new glyphs there,
// and prefer using <Icon name="…" /> directly in new code.

export function HomeIcon() {
  return <Icon name="home" />;
}

export function BuildingIcon() {
  return <Icon name="building" />;
}

export function UsersIcon() {
  return <Icon name="users" />;
}

export function MapIcon() {
  return <Icon name="map" />;
}

export function CreditCardIcon() {
  return <Icon name="credit-card" />;
}

export function DownloadIcon() {
  return <Icon name="download" />;
}

export function BellIcon() {
  return <Icon name="bell" />;
}

export function ClipboardListIcon() {
  return <Icon name="clipboard-list" />;
}

export function CalendarIcon() {
  return <Icon name="calendar" />;
}
