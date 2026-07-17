import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

const VENDOR_PREFIX = "/vendor";
const ADMIN_PREFIX = "/admin";
// Routes an already-signed-in user should be bounced away from into their dashboard.
// Deliberately excludes /reset-password and /auth/callback: Supabase's password
// recovery link signs the user into a temporary session, so a logged-in user must
// still be able to reach /reset-password to set a new password.
const REDIRECT_IF_AUTHENTICATED = ["/login", "/signup", "/forgot-password"];

/**
 * Refreshes the Supabase session cookie on every request and performs
 * *optimistic* route protection (cookie-only, no DB round trip) — per
 * Next.js guidance, Proxy should not be the only line of defense. Every
 * protected Server Action / page also calls requireVendor()/requireAdmin()
 * from lib/dal.ts, which re-checks against the database.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Supabase isn't configured yet — let public pages render instead of
    // hard-failing the whole site. Protected routes will redirect to login
    // once Supabase env vars are set.
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isVendorRoute = pathname.startsWith(VENDOR_PREFIX);
  const isAdminRoute = pathname.startsWith(ADMIN_PREFIX);

  if (!user && (isVendorRoute || isAdminRoute)) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && REDIRECT_IF_AUTHENTICATED.includes(pathname)) {
    return NextResponse.redirect(new URL("/vendor", request.url));
  }

  return supabaseResponse;
}
