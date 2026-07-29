import Link from "next/link";
import type { Metadata } from "next";
import { SignupForm } from "@/components/forms/signup-form";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Create your vendor account" };
// Category list can change (admin-managed) — always fetch fresh, never bake
// a stale list into a static build.
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (!isSupabaseConfigured()) {
    return (
      <Card>
        <CardHeader>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">Sign-up is temporarily unavailable</h1>
          <CardDescription>
            We can&rsquo;t accept new applications right now. Please try again later.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const supabase = await createClient();
  const { data: categories, error: categoriesError } = await supabase.from("categories").select("id, name").order("sort_order");
  const signupAvailable = !categoriesError && Boolean(categories?.length);

  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">Create your business account</h1>
        <CardDescription>
          One account per business — you&rsquo;ll reuse it for every future Dar Al Hay event.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!signupAvailable ? (
          <Alert variant="warning">
            Applications are temporarily paused while registration options are being prepared. Please try again later.
          </Alert>
        ) : (
          <SignupForm categories={categories ?? []} />
        )}
        <p className="text-center text-sm text-ink-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
