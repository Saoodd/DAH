import type { Metadata } from "next";
import { EventForm } from "@/components/forms/event-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata: Metadata = { title: "Create Event" };

export default function NewEventPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-950">Create event</h1>
        <p className="mt-1 text-sm text-ink-500">New events start as a draft — open registration when ready.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Event details</CardTitle>
          <CardDescription>You can edit everything later, including after registration opens.</CardDescription>
        </CardHeader>
        <CardContent>
          <EventForm />
        </CardContent>
      </Card>
    </div>
  );
}
