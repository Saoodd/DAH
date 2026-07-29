import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-950">Audit log</h1>
        <p className="mt-1 text-sm text-ink-500">Who did what, when — across the entire platform.</p>
      </div>

      <form className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select name="entityType" defaultValue={entity} className="sm:w-56">
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "All entity types" : t.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
        <Input name="q" defaultValue={search} maxLength={100} placeholder="Filter by action…" className="sm:w-64" />
      </form>

      {error ? (
        <Alert variant="error" title="Could not load the audit log">
          Refresh the page to try again.
        </Alert>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {!error && !logs?.length ? (
            <p className="px-6 py-8 text-center text-sm text-ink-400">No matching audit entries.</p>
          ) : !error ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-6 py-3 font-medium">Action</th>
                    <th className="px-6 py-3 font-medium">Entity</th>
                    <th className="px-6 py-3 font-medium">Actor</th>
                    <th className="px-6 py-3 font-medium">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {logs.map((entry) => {
                    const actor = entry.profiles as unknown as { full_name: string | null } | null;
                    return (
                      <tr key={entry.id} className="hover:bg-ink-50">
                        <td className="px-6 py-4 font-medium text-ink-900">{entry.action}</td>
                        <td className="px-6 py-4 text-ink-600">{entry.entity_type}</td>
                        <td className="px-6 py-4 text-ink-600">{actor?.full_name ?? entry.actor_role ?? "system"}</td>
                        <td className="px-6 py-4 text-ink-500">{formatDate(entry.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {!error ? <Pagination pathname="/admin/audit-log" page={page} pageSize={PAGE_SIZE} total={count ?? 0} query={{ entityType: entity === "all" ? undefined : entity, q: search || undefined }} /> : null}
        </CardContent>
      </Card>

    </div>
  );
}
