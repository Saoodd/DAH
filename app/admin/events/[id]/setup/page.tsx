import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
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

  const approvedCount = applications.filter((a) => a.setup_checklists?.final_approval).length;
  const inProgressCount = applications.filter(
    (a) => !a.setup_checklists?.final_approval && a.setup_checklists?.vendor_arrived
  ).length;
  const notStartedCount = applications.length - approvedCount - inProgressCount;

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
          <span className="text-ink-600">{event.name}</span>
        </nav>
        <h1 className="mt-3 font-display text-h2 text-ink-950 sm:text-h1">Setup check-in</h1>
        <p className="mt-2 text-sm text-ink-500">
          Confirmed vendors for setup day. Tap a booth to open its checklist.
        </p>
      </div>

      {!loadError && applications.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm" role="status" aria-label="Check-in progress">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 font-medium text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            <span className="tabular-nums">{approvedCount}</span> approved
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1.5 font-medium text-amber-800">
            <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
            <span className="tabular-nums">{inProgressCount}</span> in progress
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3.5 py-1.5 font-medium text-ink-600">
            <span className="h-2 w-2 rounded-full bg-ink-300" aria-hidden="true" />
            <span className="tabular-nums">{notStartedCount}</span> not started
          </span>
        </div>
      )}

      <form>
        <div className="relative sm:max-w-sm">
          <Icon
            name="search"
            size="sm"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <Input
            name="q"
            type="search"
            inputMode="search"
            defaultValue={search}
            maxLength={100}
            placeholder="Search business or booth number…"
            aria-label="Search by business name or booth number"
            className="h-12 pl-10 text-base"
          />
        </div>
      </form>

      {loadError ? (
        <Alert variant="error" title="Could not load setup check-in">
          Refresh the page to try again.
        </Alert>
      ) : null}

      {!loadError && !visibleApplications.length ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<Icon name="circle-check" size="lg" />}
              title={search ? "No confirmed vendors match" : "No confirmed vendors yet"}
              description={
                search
                  ? "Check the spelling, or search by booth number instead."
                  : "Vendors appear here once their booth and payment are confirmed."
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="stagger-children grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleApplications.map((a) => {
            const business = a.businesses;
            const booth = a.booths;
            const checklist = a.setup_checklists;
            return (
              <Link
                key={a.id}
                href={`/admin/events/${id}/setup/${a.id}`}
                className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
              >
                <Card interactive className="h-full">
                  <CardContent className="flex items-center gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-h4 text-ink-950">Booth {booth?.booth_number ?? "—"}</p>
                      <p className="mt-0.5 truncate text-sm text-ink-600">{business?.business_name}</p>
                      <div className="mt-2.5">
                        {checklist?.final_approval ? (
                          <Badge className="border-emerald-300 bg-emerald-100 text-emerald-800">
                            <Icon name="check" size="xs" />
                            Approved
                          </Badge>
                        ) : checklist?.vendor_arrived ? (
                          <Badge className="border-amber-300 bg-amber-100 text-amber-800">In progress</Badge>
                        ) : (
                          <Badge className="border-neutral-300 bg-neutral-100 text-neutral-600">Not started</Badge>
                        )}
                      </div>
                    </div>
                    <Icon name="chevron-right" size="sm" className="shrink-0 text-ink-300" />
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
