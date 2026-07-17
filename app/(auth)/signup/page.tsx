import Link from "next/link";
import type { Metadata } from "next";
import { SignupForm } from "@/components/forms/signup-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
          <CardTitle>Sign-up is not configured yet</CardTitle>
          <CardDescription>
            Supabase environment variables are missing. See the README for setup instructions.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const supabase = await createClient();
  const { data: categories } = await supabase.from("categories").select("id, name").order("sort_order");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your business account</CardTitle>
        <CardDescription>
          One account per business — you&rsquo;ll reuse it for every future Dar Al Hay event.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!categories?.length && (
          <Alert variant="warning">
            No business categories found. Run the seed script (see README) before accepting sign-ups.
          </Alert>
        )}
        <SignupForm categories={categories ?? []} />
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
