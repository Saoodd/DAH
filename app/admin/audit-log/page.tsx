import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Audit Log" };

const ENTITY_TYPES = [
  "all",
  "business",
  "event",
  "booth",
  "application",
  "payment",
  "waiting_list",
  "setup_checklist",
  "bank_details",
];

const PAGE_SIZE = 50;

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; q?: string; page?: string }>;
}) {
  const { entityType, q, page: pageParam } = await searchParams;
  const entity = ENTITY_TYPES.includes(entityType ?? "") ? entityType! : "all";
  const parsedPage = Number.parseInt(pageParam ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const search = q?.trim().slice(0, 100).replace(/[%_]/g, " ") || "";

  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("id, action, actor_role, entity_type, entity_id, previous_value, new_value, created_at, profiles(full_name)", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (entity !== "all") query = query.eq("entity_type", entity);
  if (search) query = query.ilike("action", `%${search}%`);

  const { data: logs, error, count } = await query;

  return (
    <div className="page-enter space-y-6">
      <div>
        <p className="text-caption font-semibold uppercase tracking-[0.14em] text-brand-700">Admin console</p>
        <h1 className="mt-2 font-display text-h2 text-ink-950 sm:text-h1">Audit log</h1>
        <p className="mt-2 text-sm text-ink-500">
          Who did what, when — across the entire platform
          {typeof count === "number" ? ` · ${count.toLocaleString("en-US")} matching` : ""}.
        </p>
      </div>

      <form className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select name="entityType" defaultValue={entity} aria-label="Filter by entity type" className="capitalize sm:w-56">
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "All entity types" : t.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
        <div className="relative sm:w-64">
          <Icon
            name="search"
            size="sm"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <Input
            name="q"
            type="search"
            defaultValue={search}
            maxLength={100}
            placeholder="Filter by action…"
            aria-label="Filter by action"
            className="pl-10"
          />
        </div>
        <Button type="submit" variant="outline">
          Apply filters
        </Button>
      </form>

      {error ? (
        <Alert variant="error" title="Could not load the audit log">
          Refresh the page to try again.
        </Alert>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {!error && !logs?.length ? (
            <EmptyState
              icon={<Icon name="clipboard-list" size="lg" />}
              title="No matching audit entries"
              description="Try a broader entity type or clear the action filter."
            />
          ) : !error ? (
            <ol className="divide-y divide-ink-100">
              {logs.map((entry) => {
                const actor = entry.profiles as unknown as { full_name: string | null } | null;
                return (
                  <li key={entry.id} className="flex gap-3.5 px-6 py-4 text-sm transition-colors hover:bg-ink-50/60">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-300 ring-4 ring-brand-50"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="font-medium text-ink-900">{entry.action}</span>
                          <span className="rounded-md bg-ink-50 px-1.5 py-0.5 text-caption font-medium capitalize text-ink-500">
                            {entry.entity_type.replace(/_/g, " ")}
                          </span>
                        </span>
                        <span className="shrink-0 text-caption text-ink-400">{formatDate(entry.created_at)}</span>
                      </div>
                      <p className="mt-0.5 text-caption text-ink-400">
                        by {actor?.full_name ?? entry.actor_role ?? "system"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : null}
          {!error ? (
            <Pagination
              pathname="/admin/audit-log"
              page={page}
              pageSize={PAGE_SIZE}
              total={count ?? 0}
              query={{ entityType: entity === "all" ? undefined : entity, q: search || undefined }}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
