import { requireVendor } from "@/lib/dal";
import { DashboardShell, type NavItem } from "@/components/layout/dashboard-shell";
import { HomeIcon, BuildingIcon } from "@/components/icons";

// Every vendor page depends on the signed-in user's session and database
// state — never prerender it statically.
export const dynamic = "force-dynamic";

const navItems: NavItem[] = [
  { href: "/vendor", label: "Dashboard", icon: <HomeIcon /> },
  { href: "/vendor/profile", label: "Business Profile", icon: <BuildingIcon /> },
];

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const { authUser, profile } = await requireVendor();

  return (
    <DashboardShell
      navItems={navItems}
      roleLabel="Vendor Portal"
      identityLabel={profile?.full_name ?? authUser.email ?? ""}
    >
      {children}
    </DashboardShell>
  );
}
