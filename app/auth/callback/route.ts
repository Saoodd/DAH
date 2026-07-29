import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeLocalRedirect } from "@/lib/local-redirect";
import { isSupabaseConfigured } from "@/lib/env";

// Handles Supabase email links: signup confirmation and password recovery.
// Both send the browser here with a `code` param (PKCE); we exchange it for
// a session, then continue to `next` (defaults to the vendor dashboard).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeLocalRedirect(searchParams.get("next"));

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/login?error=service_unavailable", origin));
  }

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, origin));
    } catch {
      // Fall through to the same safe, non-sensitive error response.
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback_failed", origin));
}
