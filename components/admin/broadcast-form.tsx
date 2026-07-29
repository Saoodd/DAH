"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { sendBroadcastAction, type Audience } from "@/app/admin/notifications/actions";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/toast";
import type { NotificationChannel } from "@/types/database";

type AudienceType = Audience["type"];

interface BroadcastFormProps {
  events: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  businesses: { id: string; business_name: string }[];
}

export function BroadcastForm({ events, categories, businesses }: BroadcastFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = React.useTransition();
  const [audienceType, setAudienceType] = React.useState<AudienceType>("all_approved");
  const [eventId, setEventId] = React.useState(events[0]?.id ?? "");
  const [categoryId, setCategoryId] = React.useState(categories[0]?.id ?? "");
  const [businessId, setBusinessId] = React.useState(businesses[0]?.id ?? "");
  const [channel, setChannel] = React.useState<NotificationChannel>("email");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");

  function buildAudience(): Audience {
    switch (audienceType) {
      case "single":
        return { type: "single", businessId };
      case "confirmed":
        return { type: "confirmed", eventId };
      case "category":
        return { type: "category", categoryId };
      case "unpaid":
        return { type: "unpaid", eventId };
      case "waiting_list":
        return { type: "waiting_list", eventId };
      default:
        return { type: "all_approved" };
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await sendBroadcastAction(buildAudience(), channel, subject, body);
      if (!result.ok) {
        toast({ title: "Couldn't send", description: result.error, variant: "error" });
        return;
      }
      const sentCount = result.sentCount ?? 0;
      const queuedCount = result.queuedCount ?? 0;
      const failedCount = result.failedCount ?? 0;
      const title = failedCount > 0
        ? "Broadcast completed with issues"
        : queuedCount > 0
          ? "Broadcast queued"
          : "Broadcast sent";
      toast({
        title,
        description: `${sentCount} sent · ${queuedCount} queued · ${failedCount} failed`,
        variant: failedCount > 0 ? "warning" : queuedCount > 0 ? "info" : "success",
      });
      setBody("");
      setSubject("");
      router.refresh();
    });
  }

  const needsEvent = ["confirmed", "unpaid", "waiting_list"].includes(audienceType);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Audience" htmlFor="audience">
          <Select id="audience" value={audienceType} onChange={(e) => setAudienceType(e.target.value as AudienceType)}>
            <option value="all_approved">All approved vendors</option>
            <option value="confirmed">All confirmed vendors (event)</option>
            <option value="category">Vendors in a category</option>
            <option value="unpaid">Vendors with unpaid balances (event)</option>
            <option value="waiting_list">Waiting-list vendors (event)</option>
            <option value="single">One vendor</option>
          </Select>
        </Field>
        <Field label="Channel" htmlFor="channel">
          <Select id="channel" value={channel} onChange={(e) => setChannel(e.target.value as NotificationChannel)}>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
          </Select>
        </Field>
      </div>

      {needsEvent && (
        <Field label="Event" htmlFor="event">
          <Select id="event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {audienceType === "category" && (
        <Field label="Category" htmlFor="category">
          <Select id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {audienceType === "single" && (
        <Field label="Vendor" htmlFor="business">
          <Select id="business" value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.business_name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {channel === "email" && (
        <Field label="Subject" htmlFor="subject" required>
          <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required />
        </Field>
      )}

      {channel === "whatsapp" && (
        <Alert variant="warning" title="WhatsApp delivery rules apply">
          This direct message works only inside Meta&rsquo;s active customer-service window. Proactive reminders require an approved WhatsApp template campaign.
        </Alert>
      )}
      <Field label="Message" htmlFor="body" required>
        <Textarea id="body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} required />
      </Field>

      <Button type="submit" loading={isPending}>
        Send
      </Button>
      <p className="text-xs text-ink-500">
        Direct broadcasts are limited to 200 recipients. Use a background campaign service for larger audiences.
      </p>
    </form>
  );
}
