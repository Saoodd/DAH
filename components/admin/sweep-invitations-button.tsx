"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { releaseExpiredInvitationsAction } from "@/app/admin/events/[id]/waiting-list/actions";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";

export function SweepInvitationsButton({ eventId }: { eventId: string }) {
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
          const result = await releaseExpiredInvitationsAction(eventId);
          if (!result.ok) {
            toast({ title: "Couldn't sweep", description: result.error, variant: "error" });
            return;
          }
          toast({ title: `${result.count ?? 0} expired invitation(s) released`, variant: "success" });
          router.refresh();
        })
      }
    >
      <Icon name="clock" size="sm" />
      Release expired invitations
    </Button>
  );
}
