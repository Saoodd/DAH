import Link from "next/link";
import type { Metadata } from "next";
import { SignupForm } from "@/components/forms/signup-form";
import { AuthHeader } from "@/components/auth/auth-header";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Create your vendor account" };
// Category list can change (admin-managed) — always fetch fresh, never bake
// a stale list into a static build.
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-[26rem]">
        <AuthHeader
          eyebrow="Vendor application"
          title="Sign-up is temporarily unavailable"
          description="We can&rsquo;t accept new applications right now. Please try again later."
        />
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Return home
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: categories, error: categoriesError } = await supabase
    .from("categories")
    .select("id, name")
    .order("sort_order");
  const signupAvailable = !categoriesError && Boolean(categories?.length);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <AuthHeader
        eyebrow="Vendor application"
        title="Tell us about your business"
        description="One account per business — you&rsquo;ll reuse it for every future Dar Al Hay event. It takes about five minutes."
      />
      <Card className="shadow-md">
        <CardContent className="p-6 sm:p-8">
          {!signupAvailable ? (
            <Alert variant="warning">
              Applications are temporarily paused while registration options are being prepared. Please try again
              later.
            </Alert>
          ) : (
            <SignupForm categories={categories ?? []} />
          )}
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-body-sm text-ink-500">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-brand-700 underline-offset-4 transition-colors hover:text-brand-800 hover:underline"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
