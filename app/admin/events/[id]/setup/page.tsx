import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Pagination } from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Setup Check-In" };

const PAGE_SIZE = 50;
const LOAD_PAGE_SIZE = 1000;
const LOAD_ROW_LIMIT = 100_000;

type SetupApplication = {
  id: string;
  businesses: { business_name: string } | null;
  booths: { booth_number: string } | null;
  setup_checklists: {
    final_approval: boolean;
    vendor_arrived: boolean;
    checkin_time: string | null;
  } | null;
};

async function loadConfirmedApplications(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string
): Promise<SetupApplication[]> {
  const rows: SetupApplication[] = [];
  for (let from = 0; from < LOAD_ROW_LIMIT; from += LOAD_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("applications")
      .select("id, businesses(business_name), booths(booth_number), setup_checklists(final_approval, vendor_arrived, checkin_time)")
      .eq("event_id", eventId)
      .eq("status", "confirmed")
      .order("id")
      .range(from, from + LOAD_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as SetupApplication[];
    rows.push(...page);
    if (page.length < LOAD_PAGE_SIZE) return rows;
  }
  throw new Error("Setup list exceeds the 100,000-row safety limit.");
}

export default async function AdminSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { id } = await params;
  const { q, page: pageParam } = await searchParams;
  const search = q?.trim().slice(0, 100) ?? "";
  const parsedPage = Number.parseInt(pageParam ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const supabase = await createClient();

  const { data: event, error: eventError } = await supabase.from("events").select("id, name").eq("id", id).maybeSingle();
  if (eventError) throw new Error("Could not load the setup workspace.");
  if (!event) notFound();

  let applications: SetupApplication[] = [];
  let loadError = false;
  try {
    applications = await loadConfirmedApplications(supabase, id);
  } catch (error) {
    console.error("Failed to load setup applications", error);
    loadError = true;
  }

  const filtered = (applications ?? []).filter((a) => {
    if (!search) return true;
    const needle = search.toLocaleLowerCase();
    return a.businesses?.business_name.toLocaleLowerCase().includes(needle) || a.booths?.booth_number.toLocaleLowerCase().includes(needle);
  });
  const visibleApplications = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
        <Input name="q" defaultValue={search} maxLength={100} placeholder="Search business or booth number…" className="sm:max-w-sm" />
      </form>

      {loadError ? (
        <Alert variant="error" title="Could not load setup check-in">
          Refresh the page to try again.
        </Alert>
      ) : null}

      {!loadError && !visibleApplications.length ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-ink-400">No confirmed vendors match.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleApplications.map((a) => {
            const business = a.businesses;
            const booth = a.booths;
            const checklist = a.setup_checklists;
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
      {!loadError ? (
        <Pagination
          pathname={`/admin/events/${id}/setup`}
          page={page}
          pageSize={PAGE_SIZE}
          total={filtered.length}
          query={{ q: search || undefined }}
        />
      ) : null}

    </div>

  );
}
