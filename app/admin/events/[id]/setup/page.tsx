import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Setup Check-In" };

export default async function AdminSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;
  const supabase = await createClient();

  const { data: event } = await supabase.from("events").select("id, name").eq("id", id).maybeSingle();
  if (!event) notFound();

  const { data: applications } = await supabase
    .from("applications")
    .select("id, businesses(business_name), booths(booth_number), setup_checklists(final_approval, vendor_arrived, checkin_time)")
    .eq("event_id", id)
    .eq("status", "confirmed");

  const filtered = (applications ?? []).filter((a) => {
    if (!q) return true;
    const business = a.businesses as unknown as { business_name: string } | null;
    const booth = a.booths as unknown as { booth_number: string } | null;
    const needle = q.toLowerCase();
    return business?.business_name.toLowerCase().includes(needle) || booth?.booth_number.toLowerCase().includes(needle);
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-400">
          <Link href="/admin/events" className="hover:text-brand-600">
            Events
          </Link>{" "}
          / {event.name}
        </p>
        <h1 className="text-2xl font-semibold text-ink-950">Setup check-in</h1>
        <p className="mt-1 text-sm text-ink-500">Confirmed vendors for setup day. Search by business or booth number.</p>
      </div>

      <form>
        <Input name="q" defaultValue={q} placeholder="Search business or booth number…" className="sm:max-w-sm" />
      </form>

      {!filtered.length ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-ink-400">No confirmed vendors match.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => {
            const business = a.businesses as unknown as { business_name: string } | null;
            const booth = a.booths as unknown as { booth_number: string } | null;
            const checklist = a.setup_checklists as unknown as { final_approval: boolean; vendor_arrived: boolean; checkin_time: string | null } | null;
            return (
              <Link key={a.id} href={`/admin/events/${id}/setup/${a.id}`}>
                <Card className="h-full transition-colors hover:border-brand-300">
                  <CardContent className="py-4">
                    <p className="font-semibold text-ink-900">Booth {booth?.booth_number ?? "—"}</p>
                    <p className="text-sm text-ink-600">{business?.business_name}</p>
                    <div className="mt-2 flex gap-2">
                      {checklist?.final_approval ? (
                        <Badge className="border-emerald-300 bg-emerald-100 text-emerald-800">Approved</Badge>
                      ) : checklist?.vendor_arrived ? (
                        <Badge className="border-amber-300 bg-amber-100 text-amber-800">In progress</Badge>
                      ) : (
                        <Badge className="border-neutral-300 bg-neutral-100 text-neutral-600">Not started</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
