import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";

interface LogAuditParams {
  actorId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  previousValue?: Json;
  newValue?: Json;
  metadata?: Json;
}

/**
 * Records an entry in the platform-wide audit log (section 18 of the spec).
 * Call this from Server Actions right after a mutation succeeds. Failures to
 * write the audit row are logged but never block the underlying action —
 * losing an audit entry shouldn't take down an approval or payment flow.
 */
export async function logAudit(
  supabase: SupabaseClient<Database>,
  params: LogAuditParams
) {
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: params.actorId,
    actor_role: params.actorRole,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    previous_value: params.previousValue ?? null,
    new_value: params.newValue ?? null,
    metadata: params.metadata ?? {},
  });

  if (error) {
    console.error("Failed to write audit log", params.action, error);
  }
}
