"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { joinWaitingListAction, acceptInvitationAction, declineInvitationAction } from "@/app/vendor/waiting-list/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import type { Database } from "@/types/database";

type WaitingListEntry = Database["public"]["Tables"]["waiting_list"]["Row"];
type Zone = Database["public"]["Tables"]["zones"]["Row"];

function msRemaining(deadline: string | null) {
  return deadline ? Math.max(0, new Date(deadline).getTime() - Date.now()) : null;
}

export function WaitingListPanel({
  eventId,
  entry,
  zones,
  boothLockMinutes,
  invitedBoothNumber,
}: {
  eventId: string;
  entry: WaitingListEntry | null;
  zones: Zone[];
  boothLockMinutes: number;
  invitedBoothNumber: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = React.useTransition();
  const [remainingMs, setRemainingMs] = React.useState(() => msRemaining(entry?.invitation_expires_at ?? null));

  React.useEffect(() => {
    if (entry?.status !== "invited") return;
    const interval = setInterval(() => setRemainingMs(msRemaining(entry.invitation_expires_at)), 1000);
    return () => clearInterval(interval);
  }, [entry?.status, entry?.invitation_expires_at]);

  React.useEffect(() => {
    if (remainingMs === 0) router.refresh();
  }, [remainingMs, router]);

  function onJoin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await joinWaitingListAction(eventId, formData);
      if (!result.ok) {
        toast({ title: "Couldn't join waiting list", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Added to the waiting list", variant: "success" });
      router.refresh();
    });
  }

  function onAccept() {
    if (!entry?.invited_booth_id) return;
    startTransition(async () => {
      const result = await acceptInvitationAction(entry.invited_booth_id!, boothLockMinutes);
      if (!result.ok) {
        toast({ title: "Couldn't accept", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Booth held for you — complete your selection", variant: "success" });
      router.refresh();
    });
  }

  function onDecline() {
    if (!entry) return;
    startTransition(async () => {
      const result = await declineInvitationAction(entry.id);
      if (!result.ok) {
        toast({ title: "Couldn't decline", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Invitation declined", variant: "success" });
      router.refresh();
    });
  }

  if (entry?.status === "invited") {
    const minutes = remainingMs !== null ? Math.floor(remainingMs / 60000) : null;
    const seconds = remainingMs !== null ? Math.floor(((remainingMs ?? 0) % 60000) / 1000) : null;
    return (
      <Card>
        <CardContent className="space-y-4 py-6">
          <Alert variant="success" title={`Booth ${invitedBoothNumber} is available for you`}>
            {minutes !== null ? `Accept within ${minutes}:${String(seconds).padStart(2, "0")} or it will be offered to the next vendor.` : ""}
          </Alert>
          <div className="flex gap-3">
            <Button onClick={onAccept} loading={isPending}>
              Accept
            </Button>
            <Button variant="outline" onClick={onDecline} loading={isPending}>
              Decline
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (entry?.status === "waiting") {
    return (
      <Card>
        <CardContent className="py-6">
          <Alert variant="info" title="You're on the waiting list">
            We&rsquo;ll notify you the moment a matching booth becomes available.
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join the waiting list</CardTitle>
        <CardDescription>Tell us your preferences and we&rsquo;ll reach out when a matching booth opens up.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onJoin} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Preferred booth size" htmlFor="preferredBoothSize">
              <Input id="preferredBoothSize" name="preferredBoothSize" placeholder="e.g. 3x3m" />
            </Field>
            <Field label="Max budget (AED)" htmlFor="maxBudget">
              <Input id="maxBudget" name="maxBudget" type="number" min={0} />
            </Field>
            <Field label="Preferred zone" htmlFor="preferredZoneId">
              <Select id="preferredZoneId" name="preferredZoneId">
                <option value="">Any zone</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button type="submit" loading={isPending}>
            Join waiting list
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
