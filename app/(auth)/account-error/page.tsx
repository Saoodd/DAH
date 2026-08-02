import Link from "next/link";
import type { Metadata } from "next";
import { logoutAction } from "@/app/auth/actions";
import { AuthHeader } from "@/components/auth/auth-header";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Account needs attention" };

export default function AccountErrorPage() {
  return (
    <div className="mx-auto w-full max-w-[26rem]">
      <AuthHeader
        eyebrow="Your account"
        title="Account needs attention"
        description="We could not load the profile attached to this sign-in."
      />
      <Card className="shadow-md">
        <CardContent className="space-y-5 p-6 sm:p-8">
          <Alert variant="warning" title="Your account data is incomplete">
            Sign out and try again. If the problem continues, contact the Dar Al Hay event team so they can restore
            your profile.
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
    </div>
  );
}
