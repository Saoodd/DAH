import Link from "next/link";
import type { Metadata } from "next";
import { logoutAction } from "@/app/auth/actions";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Account needs attention" };

export default function AccountErrorPage() {
  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">Account needs attention</h1>
        <CardDescription>We could not load the profile attached to this sign-in.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Alert variant="warning" title="Your account data is incomplete">
          Sign out and try again. If the problem continues, contact the Dar Al Hay event team so they can restore your profile.
        </Alert>
        <div className="flex flex-col gap-3 sm:flex-row">
          <form action={logoutAction} className="flex-1">
            <Button type="submit" className="w-full">
              Sign out
            </Button>
          </form>
          <Link href="/" className={buttonVariants({ variant: "outline", className: "flex-1" })}>
            Return home
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
