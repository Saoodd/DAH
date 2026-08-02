import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { AuthHeader } from "@/components/auth/auth-header";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Set a new password" };

export default function ResetPasswordPage() {
  const serviceAvailable = isSupabaseConfigured();
  return (
    <div className="mx-auto w-full max-w-[26rem]">
      <AuthHeader
        eyebrow="Account recovery"
        title="Set a new password"
        description="Choose a new password for your vendor account. You&rsquo;ll stay logged in once it&rsquo;s saved."
      />
      <Card className="shadow-md">
        <CardContent className="p-6 sm:p-8">
          {serviceAvailable ? (
            <ResetPasswordForm />
          ) : (
            <Alert variant="error">Password reset is temporarily unavailable. Please try again later.</Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
