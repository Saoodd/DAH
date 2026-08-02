import Link from "next/link";
import type { Metadata } from "next";
import { EventForm } from "@/components/forms/event-form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Create Event" };

export default function NewEventPage() {
  return (
    <div className="page-enter space-y-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-ink-400">
          <Link
            href="/admin/events"
            className="transition-colors hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            Events
          </Link>
          <span aria-hidden="true"> / </span>
          <span className="text-ink-600">New event</span>
        </nav>
        <h1 className="mt-3 font-display text-h2 text-ink-950 sm:text-h1">Create event</h1>
        <p className="mt-2 text-sm text-ink-500">
          New events start as a draft — open registration when ready. Everything can be edited later, including
          after registration opens.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 sm:p-8">
          <EventForm />
        </CardContent>
      </Card>
    </div>
  );
}
