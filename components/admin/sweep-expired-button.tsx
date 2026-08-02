"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { sweepExpiredPaymentsAction } from "@/app/admin/events/[id]/payments/actions";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";

export function SweepExpiredButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = React.useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      loading={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await sweepExpiredPaymentsAction(eventId);
          if (!result.ok) {
            toast({ title: "Couldn't sweep", description: result.error, variant: "error" });
            return;
          }
          toast({ title: `${result.count ?? 0} expired payment(s) released`, variant: "success" });
          router.refresh();
        })
      }
    >
      <Icon name="clock" size="sm" />
      Release expired payments
    </Button>
  );
}
