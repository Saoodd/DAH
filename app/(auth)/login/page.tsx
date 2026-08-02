import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "@/components/forms/login-form";
import { AuthHeader } from "@/components/auth/auth-header";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const serviceUnavailable = !isSupabaseConfigured() || params.error === "service_unavailable";

  return (
    <div className="mx-auto w-full max-w-[26rem]">
      <AuthHeader
        eyebrow="Vendor portal"
        title="Welcome back"
        description="Log in to manage your profile, booth, and payments."
      />
      <Card className="shadow-md">
        <CardContent className="space-y-5 p-6 sm:p-8">
          {params.error === "auth_callback_failed" && (
            <Alert variant="error">That link has expired or was already used. Please try again.</Alert>
          )}
          {serviceUnavailable ? (
            <Alert variant="error">Sign-in is temporarily unavailable. Please try again later.</Alert>
          ) : (
            <LoginForm next={params.next} />
          )}
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-body-sm text-ink-500">
        New to Dar Al Hay?{" "}
        <Link
          href="/signup"
          className="font-medium text-brand-700 underline-offset-4 transition-colors hover:text-brand-800 hover:underline"
        >
          Apply as a vendor
        </Link>
      </p>
    </div>
  );
}
