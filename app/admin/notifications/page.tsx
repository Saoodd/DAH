import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BroadcastForm } from "@/components/admin/broadcast-form";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Notifications" };

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-800 border-emerald-300",
  queued: "bg-amber-100 text-amber-800 border-amber-300",
  delivered: "bg-emerald-100 text-emerald-800 border-emerald-300",
  failed: "bg-red-100 text-red-800 border-red-300",
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-950">Notifications</h1>
        <p className="mt-1 text-sm text-ink-500">
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
        </CardHeader>
        <CardContent className="p-0">
          {!history?.length ? (
            <p className="px-6 py-8 text-center text-sm text-ink-400">No notifications sent yet.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {history.map((n) => {
                const business = n.businesses as unknown as { business_name: string } | null;
                return (
                  <li key={n.id} className="flex items-center justify-between gap-4 px-6 py-3 text-sm">
                    <div>
                      <p className="font-medium text-ink-800">
                        {business?.business_name ?? n.recipient} · {n.channel}
                      </p>
                      <p className="text-xs text-ink-400">{n.subject || "—"}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={STATUS_COLORS[n.status] ?? ""}>{n.status}</Badge>
                      <span className="text-xs text-ink-400">{formatDate(n.created_at)}</span>
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
