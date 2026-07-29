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

const AUDIENCE_PAGE_SIZE = 100;
const MAX_DIRECT_BROADCAST_RECIPIENTS = 200;
const DISPATCH_CONCURRENCY = 10;

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function rowsOrThrow<T>(data: T[] | null, error: unknown): T[] {
  if (error) throw error;
  return data ?? [];
}

async function fetchAudiencePages<T>(
  getPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from <= MAX_DIRECT_BROADCAST_RECIPIENTS; from += AUDIENCE_PAGE_SIZE) {
    const page = await getPage(from, from + AUDIENCE_PAGE_SIZE - 1);
    const pageRows = rowsOrThrow(page.data, page.error);
    rows.push(...pageRows);
    if (rows.length > MAX_DIRECT_BROADCAST_RECIPIENTS) {
      throw new Error("AUDIENCE_TOO_LARGE");
    }
    if (pageRows.length < AUDIENCE_PAGE_SIZE) return rows;
  }
  return rows;
}

async function resolveAudience(supabase: Awaited<ReturnType<typeof createClient>>, audience: Audience): Promise<string[]> {
  switch (audience.type) {
    case "single":
      return [audience.businessId];
    case "all_approved": {
      const rows = await fetchAudiencePages((from, to) =>
        supabase
          .from("businesses")
          .select("id")
          .eq("approval_status", "approved")
          .order("id")
          .range(from, to)
      );
      return rows.map((business) => business.id);
    }
    case "confirmed": {
      const rows = await fetchAudiencePages((from, to) =>
        supabase
          .from("applications")
          .select("business_id")
          .eq("event_id", audience.eventId)
          .eq("status", "confirmed")
          .order("id")
          .range(from, to)
      );
      return rows.map((application) => application.business_id);
    }
    case "category": {
      const rows = await fetchAudiencePages((from, to) =>
        supabase
          .from("businesses")
          .select("id")
          .eq("category_id", audience.categoryId)
          .eq("approval_status", "approved")
          .order("id")
          .range(from, to)
      );
      return rows.map((business) => business.id);
    }
    case "unpaid": {
      const rows = await fetchAudiencePages((from, to) =>
        supabase
          .from("payments")
          .select("applications!inner(event_id, business_id)")
          .eq("applications.event_id", audience.eventId)
          .in("status", ["payment_required", "pending_payment", "pending_verification"])
          .order("id")
          .range(from, to)
      );
      return rows.map(
        (payment) =>
          (payment.applications as unknown as { business_id: string }).business_id
      );
    }
    case "waiting_list": {
      const rows = await fetchAudiencePages((from, to) =>
        supabase
          .from("waiting_list")
          .select("business_id")
          .eq("event_id", audience.eventId)
          .eq("status", "waiting")
          .order("id")
          .range(from, to)
      );
      return rows.map((entry) => entry.business_id);
    }
  }
}

export async function sendBroadcastAction(
  audience: Audience,
  channel: NotificationChannel,
  subject: string,
  body: string
): Promise<ActionResult & { sentCount?: number; queuedCount?: number; failedCount?: number }> {
  const { authUser } = await requireAdmin();
  const normalizedBody = body.trim();
  const normalizedSubject = subject.trim();
  if (!normalizedBody) return fail("Message body is required.");
  if (normalizedBody.length > 5000) return fail("Keep the message under 5,000 characters.");
  if (normalizedSubject.length > 200) return fail("Keep the subject under 200 characters.");
  if (channel === "email" && !normalizedSubject) return fail("An email subject is required.");

  const supabase = await createClient();
  let businessIds: string[];
  try {
    businessIds = Array.from(new Set(await resolveAudience(supabase, audience)));
  } catch (error) {
    if (error instanceof Error && error.message === "AUDIENCE_TOO_LARGE") {
      return fail("This audience exceeds the 200-recipient direct-send limit. Choose a narrower audience or use a background campaign service.");
    }
    console.error("[notifications] Broadcast audience lookup failed.", error);
    return fail("Could not load the selected audience. Please try again.");
  }

  if (businessIds.length === 0) return fail("No vendors match this audience.");

  let sentCount = 0;
  let queuedCount = 0;
  let failedCount = 0;
  for (let index = 0; index < businessIds.length; index += DISPATCH_CONCURRENCY) {
    const batch = businessIds.slice(index, index + DISPATCH_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((businessId) =>
        sendCustomMessage(supabase, {
          businessId,
          channel,
          subject: normalizedSubject,
          body: normalizedBody,
          sentBy: authUser.id,
        })
      )
    );
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[notifications] Broadcast dispatch failed.", result.reason);
        failedCount += 1;
      } else if (result.value.status === "sent") sentCount += 1;
      else if (result.value.status === "queued") queuedCount += 1;
      else failedCount += 1;
    }
  }

  revalidatePath("/admin/notifications");
  return { ok: true, sentCount, queuedCount, failedCount };
}
