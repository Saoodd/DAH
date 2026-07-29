import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Set a new password" };

export default function ResetPasswordPage() {
  const serviceAvailable = isSupabaseConfigured();
  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">Set a new password</h1>
        <CardDescription>Choose a new password for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        {serviceAvailable ? (
          <ResetPasswordForm />
        ) : (
          <Alert variant="error">Password reset is temporarily unavailable. Please try again later.</Alert>
        )}
      </CardContent>
    </Card>
  );
}
