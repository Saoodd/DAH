import Link from "next/link";
import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import { AuthHeader } from "@/components/auth/auth-header";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  const serviceAvailable = isSupabaseConfigured();
  return (
    <div className="mx-auto w-full max-w-[26rem]">
      <AuthHeader
        eyebrow="Account recovery"
        title="Reset your password"
        description="Enter the email you signed up with and we&rsquo;ll send you a secure link to choose a new one."
      />
      <Card className="shadow-md">
        <CardContent className="p-6 sm:p-8">
          {serviceAvailable ? (
            <ForgotPasswordForm />
          ) : (
            <Alert variant="error">Password reset is temporarily unavailable. Please try again later.</Alert>
          )}
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-body-sm text-ink-500">
        Remembered your password?{" "}
        <Link
          href="/login"
          className="font-medium text-brand-700 underline-offset-4 transition-colors hover:text-brand-800 hover:underline"
        >
          Back to log in
        </Link>
      </p>
    </div>
  );
}
