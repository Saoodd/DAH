"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";
import { sendCustomMessage } from "@/lib/notifications";
import type { ActionResult } from "@/app/auth/actions";
import type { NotificationChannel } from "@/types/database";

export type Audience =
  | { type: "single"; businessId: string }
  | { type: "all_approved" }
  | { type: "confirmed"; eventId: string }
  | { type: "category"; categoryId: string }
  | { type: "unpaid"; eventId: string }
  | { type: "waiting_list"; eventId: string };

function fail(error: string): ActionResult {
  return { ok: false, error };
}

async function resolveAudience(supabase: Awaited<ReturnType<typeof createClient>>, audience: Audience): Promise<string[]> {
  switch (audience.type) {
    case "single":
      return [audience.businessId];
    case "all_approved": {
      const { data } = await supabase.from("businesses").select("id").eq("approval_status", "approved");
      return (data ?? []).map((b) => b.id);
    }
    case "confirmed": {
      const { data } = await supabase.from("applications").select("business_id").eq("event_id", audience.eventId).eq("status", "confirmed");
      return (data ?? []).map((a) => a.business_id);
    }
    case "category": {
      const { data } = await supabase.from("businesses").select("id").eq("category_id", audience.categoryId).eq("approval_status", "approved");
      return (data ?? []).map((b) => b.id);
    }
    case "unpaid": {
      const { data } = await supabase
        .from("payments")
        .select("applications!inner(event_id, business_id)")
        .eq("applications.event_id", audience.eventId)
        .in("status", ["payment_required", "pending_payment", "pending_verification"]);
      return (data ?? []).map((p) => (p.applications as unknown as { business_id: string }).business_id);
    }
    case "waiting_list": {
      const { data } = await supabase.from("waiting_list").select("business_id").eq("event_id", audience.eventId).eq("status", "waiting");
      return (data ?? []).map((w) => w.business_id);
    }
  }
}

export async function sendBroadcastAction(
  audience: Audience,
  channel: NotificationChannel,
  subject: string,
  body: string
): Promise<ActionResult & { sentCount?: number }> {
  const { authUser } = await requireAdmin();
  if (!body.trim()) return fail("Message body is required.");

  const supabase = await createClient();
  const businessIds = Array.from(new Set(await resolveAudience(supabase, audience)));
  if (businessIds.length === 0) return fail("No vendors match this audience.");

  let sentCount = 0;
  for (const businessId of businessIds) {
    const result = await sendCustomMessage(supabase, { businessId, channel, subject, body, sentBy: authUser.id });
    if (result.status !== "failed") sentCount += 1;
  }

  revalidatePath("/admin/notifications");
  return { ok: true, sentCount };
}
