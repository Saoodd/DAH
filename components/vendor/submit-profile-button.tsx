"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { submitProfileForReviewAction } from "@/app/vendor/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function SubmitProfileButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = React.useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await submitProfileForReviewAction();
      if (!result.ok) {
        toast({ title: "Couldn't submit", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Profile submitted", description: "Saeed or Omar will review it shortly.", variant: "success" });
      router.refresh();
    });
  }

  return (
    <Button onClick={handleClick} loading={isPending}>
      Submit for review
    </Button>
  );
}
