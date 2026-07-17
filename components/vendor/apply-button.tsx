"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { applyToEventAction } from "@/app/vendor/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function ApplyButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = React.useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await applyToEventAction(eventId);
      if (!result.ok) {
        toast({ title: "Couldn't apply", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Application submitted", variant: "success" });
      router.refresh();
    });
  }

  return (
    <Button onClick={handleClick} loading={isPending}>
      Apply to this event
    </Button>
  );
}
