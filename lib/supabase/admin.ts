import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getEnv, requireSupabaseEnv } from "@/lib/env";

/**
 * Service-role Supabase client. Bypasses Row Level Security entirely.
 * Server-only, never import from a Client Component. Restrict use to:
 *  - admin operations that must read/write across all vendors
 *  - background jobs (lock expiry sweep, payment deadline sweep)
 *  - the dev-only seed script
 */
export function createAdminClient() {
  const { url } = requireSupabaseEnv();
  const serviceRoleKey = getEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Required for admin-only server operations (see .env.example)."
    );
  }
  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
