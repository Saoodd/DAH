import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { BroadcastForm } from "@/components/admin/broadcast-form";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Notifications" };

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-800 border-emerald-300",
  queued: "bg-amber-100 text-amber-800 border-amber-300",
  delivered: "bg-emerald-100 text-emerald-800 border-emerald-300",
  failed: "bg-red-100 text-red-800 border-red-300",
};

const CHANNEL_ICONS: Record<string, IconName> = {
  email: "mail",
  sms: "bell",
  whatsapp: "bell",
};

export default async function AdminNotificationsPage() {
  const supabase = await createClient();

  const [{ data: events }, { data: categories }, { data: businesses }, { data: history }] = await Promise.all([
    supabase.from("events").select("id, name").order("created_at", { ascending: false }),
    supabase.from("categories").select("id, name").order("sort_order"),
    supabase.from("businesses").select("id, business_name").eq("approval_status", "approved").order("business_name"),
    supabase
      .from("notifications")
      .select("id, channel, recipient, subject, status, created_at, businesses(business_name)")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="page-enter space-y-6">
      <div>
        <p className="text-caption font-semibold uppercase tracking-[0.14em] text-brand-700">Admin console</p>
        <h1 className="mt-2 font-display text-h2 text-ink-950 sm:text-h1">Notifications</h1>
        <p className="mt-2 text-sm text-ink-500">
          Send announcements and view delivery history. Email/SMS/WhatsApp providers not yet configured are shown
          as &ldquo;Queued&rdquo; — see .env.example.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Send a message</CardTitle>
          <CardDescription>Message an audience directly, or a single vendor.</CardDescription>
        </CardHeader>
        <CardContent>
          <BroadcastForm events={events ?? []} categories={categories ?? []} businesses={businesses ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent history</CardTitle>
          <CardDescription>The last 50 messages, most recent first.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!history?.length ? (
            <EmptyState
              icon={<Icon name="bell" size="lg" />}
              title="No notifications sent yet"
              description="Broadcasts and direct messages will appear here once you send them."
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {history.map((n) => {
                const business = n.businesses as unknown as { business_name: string } | null;
                return (
                  <li
                    key={n.id}
                    className="flex items-center justify-between gap-4 px-6 py-3.5 text-sm transition-colors hover:bg-ink-50/60"
                  >
                    <div className="flex min-w-0 items-center gap-3.5">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-400"
                        aria-hidden="true"
                      >
                        <Icon name={CHANNEL_ICONS[n.channel] ?? "bell"} size="sm" strokeWidth={1.6} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink-800">
                          {business?.business_name ?? n.recipient}
                          <span className="ml-2 text-caption font-normal uppercase tracking-wide text-ink-400">
                            {n.channel}
                          </span>
                        </p>
                        <p className="truncate text-caption text-ink-400">{n.subject || "—"}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge className={`capitalize ${STATUS_COLORS[n.status] ?? ""}`}>{n.status}</Badge>
                      <span className="hidden text-caption text-ink-400 sm:block">{formatDate(n.created_at)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
