import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  const serviceAvailable = isSupabaseConfigured();
  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">Reset your password</h1>
        <CardDescription>We&rsquo;ll email you a secure link to set a new password.</CardDescription>
      </CardHeader>
      <CardContent>
        {serviceAvailable ? (
          <ForgotPasswordForm />
        ) : (
          <Alert variant="error">Password reset is temporarily unavailable. Please try again later.</Alert>
        )}
      </CardContent>
    </Card>
  );
}
