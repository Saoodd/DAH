"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createClient() {
  // NEXT_PUBLIC values must be referenced directly for Next.js to inline them
  // into the browser bundle; accessing them through the server env parser
  // leaves them undefined at runtime.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("The account service is not configured.");
  }

  return createBrowserClient<Database>(url, anonKey);
}
