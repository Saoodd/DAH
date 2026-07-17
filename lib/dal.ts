import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Business = Database["public"]["Tables"]["businesses"]["Row"];

/**
 * Data Access Layer — the single place that verifies who's asking before
 * data is returned. Proxy only does optimistic cookie checks; every
 * Server Component, Server Action, and Route Handler that touches
 * vendor/admin data should go through these functions instead of trusting
 * the route it was called from.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  return { authUser: user, profile: profile as Profile | null };
});

export async function requireUser() {
  const session = await getCurrentUser();
  if (!session) redirect("/login");
  return session;
}

export async function requireVendor() {
  const session = await requireUser();
  if (session.profile?.role !== "vendor") redirect("/admin");
  return session;
}

export async function requireAdmin() {
  const session = await requireUser();
  if (session.profile?.role !== "admin") redirect("/vendor");
  return session;
}

export const getOwnedBusiness = cache(async (): Promise<Business | null> => {
  const session = await getCurrentUser();
  if (!session || session.profile?.role !== "vendor") return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", session.authUser.id)
    .maybeSingle();

  return data as Business | null;
});

export async function requireOwnedBusiness() {
  await requireVendor();
  const business = await getOwnedBusiness();
  if (!business) redirect("/vendor/profile?new=1");
  return business;
}
