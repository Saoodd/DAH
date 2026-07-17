import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "@/components/forms/login-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Log in to your Dar Al Hay Events vendor account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {params.error === "auth_callback_failed" && (
          <Alert variant="error">That link has expired or was already used. Please try again.</Alert>
        )}
        <LoginForm next={params.next} />
        <p className="text-center text-sm text-ink-500">
          New to Dar Al Hay?{" "}
          <Link href="/signup" className="font-medium text-brand-600 hover:text-brand-700">
            Apply as a vendor
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
