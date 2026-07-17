import { requireAdmin } from "@/lib/dal";
import { DashboardShell, type NavItem } from "@/components/layout/dashboard-shell";
import { HomeIcon, UsersIcon } from "@/components/icons";

// Every admin page depends on the signed-in user's session and database
// state — never prerender it statically.
export const dynamic = "force-dynamic";

const navItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: <HomeIcon /> },
  { href: "/admin/vendors", label: "Vendors", icon: <UsersIcon /> },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { authUser, profile } = await requireAdmin();

  return (
    <DashboardShell
      navItems={navItems}
      roleLabel="Admin Console"
      identityLabel={profile?.full_name ?? authUser.email ?? ""}
    >
      {children}
    </DashboardShell>
  );
}
