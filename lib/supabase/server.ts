import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { requireSupabaseEnv } from "@/lib/env";

/**
 * Server-side Supabase client bound to the request's cookies. Use this in
 * Server Components, Server Actions, and Route Handlers. Respects RLS as the
 * currently signed-in user — never use it to bypass policies.
 */
export async function createClient() {
  // Read cookies() before validating env: this is a dynamic API and must be
  // called unconditionally so Next.js correctly opts the route out of
  // static prerendering, even when Supabase isn't configured (e.g. a build
  // without env vars set yet).
  const cookieStore = await cookies();
  const { url, anonKey } = requireSupabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component with no request context to mutate
          // (e.g. a page render, not a Server Action). The proxy handles
          // refreshing the session cookie in that case, so this is safe to ignore.
        }
      },
    },
  });
}
