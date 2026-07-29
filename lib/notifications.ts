import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, NotificationChannel } from "@/types/database";
import { getEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

type Client = SupabaseClient<Database>;

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => variables[key] ?? match);
}

interface SendNotificationParams {
  businessId: string;
  templateKey: string;
  variables?: Record<string, string>;
  /** Restrict to specific channels for this send (defaults to every active template for the key). */
  channels?: NotificationChannel[];
}

export interface DispatchResult {
  channel: NotificationChannel;
  status: "sent" | "queued" | "failed";
}

function failedResults(channels?: NotificationChannel[]): DispatchResult[] {
  return (channels ?? []).map((channel) => ({ channel, status: "failed" }));
}

function logNotificationError(operation: string, error: unknown) {
  const details =
    error && typeof error === "object"
      ? {
          code: "code" in error ? String(error.code) : undefined,
          message: "message" in error ? String(error.message) : undefined,
        }
      : undefined;
  console.error(`[notifications] ${operation} failed.`, details);
}

function logMissingProvider(channel: NotificationChannel, developmentDetails: string) {
  const message =
    process.env.NODE_ENV === "production"
      ? `[notifications:${channel}] Provider is not configured; message queued.`
      : developmentDetails;
  console.info(message);
}

/**
 * Renders the named template for every active channel it's defined on and
 * dispatches it, recording one row per channel in `notifications` regardless
 * of outcome. When a channel's provider isn't configured (no API key in
 * env), the message is recorded as "queued" rather than faked as sent —
 * see dispatchEmail/dispatchSms/dispatchWhatsApp below for the dev-only
 * placeholder behavior.
 */
export async function sendNotification(
  supabase: Client,
  { businessId, templateKey, variables = {}, channels }: SendNotificationParams
): Promise<DispatchResult[]> {
  const { data: business, error: businessError } = await supabase.from("businesses").select("business_name, owner_name, email, phone").eq("id", businessId).maybeSingle();
  if (businessError) {
    logNotificationError("business lookup", businessError);
    return failedResults(channels);
  }
  if (!business) {
    console.error("[notifications] Business lookup returned no record.");
    return failedResults(channels);
  }

  let query = supabase.from("notification_templates").select("*").eq("key", templateKey).eq("is_active", true);
  if (channels?.length) query = query.in("channel", channels);
  const { data: templates, error: templateError } = await query;
  if (templateError) {
    logNotificationError("template lookup", templateError);
    return failedResults(channels);
  }

  const mergedVariables = { business_name: business.business_name, owner_name: business.owner_name, ...variables };
  const results: DispatchResult[] = [];

  for (const template of templates ?? []) {
    const body = renderTemplate(template.body, mergedVariables);
    const subject = template.subject ? renderTemplate(template.subject, mergedVariables) : null;
    const recipient = template.channel === "email" ? business.email : business.phone;

    const result = await dispatch(template.channel, recipient, subject, body);

    const { error: insertError } = await supabase.from("notifications").insert({
      business_id: businessId,
      channel: template.channel,
      template_key: templateKey,
      recipient,
      subject,
      body,
      status: result.status,
      sent_by: null,
    });
    if (insertError) {
      logNotificationError("history insert", insertError);
    }

    results.push({ channel: template.channel, status: result.status });
  }

  return results;
}

/** Uses the service-role client for post-mutation vendor notifications. */
export async function sendTrustedNotification(
  params: SendNotificationParams
): Promise<DispatchResult[]> {
  try {
    return await sendNotification(createAdminClient(), params);
  } catch (error) {
    logNotificationError(`trusted template dispatch (${params.templateKey})`, error);
    return failedResults(params.channels);
  }
}

/** For admin-composed one-off messages (no template). */
export async function sendCustomMessage(
  supabase: Client,
  params: { businessId: string; channel: NotificationChannel; subject?: string; body: string; sentBy: string }
): Promise<DispatchResult> {
  const { data: business, error: businessError } = await supabase.from("businesses").select("email, phone").eq("id", params.businessId).maybeSingle();
  if (businessError) {
    logNotificationError("custom-message business lookup", businessError);
    return { channel: params.channel, status: "failed" };
  }
  if (!business) {
    console.error("[notifications] Custom-message business lookup returned no record.");
    return { channel: params.channel, status: "failed" };
  }

  const recipient = params.channel === "email" ? business.email : business.phone;
  const result = await dispatch(params.channel, recipient, params.subject ?? null, params.body);

  const { error: insertError } = await supabase.from("notifications").insert({
    business_id: params.businessId,
    channel: params.channel,
    template_key: null,
    recipient,
    subject: params.subject ?? null,
    body: params.body,
    status: result.status,
    sent_by: params.sentBy,
  });
  if (insertError) {
    logNotificationError("custom-message history insert", insertError);
  }

  return { channel: params.channel, status: result.status };
}

async function dispatch(
  channel: NotificationChannel,
  recipient: string,
  subject: string | null,
  body: string
): Promise<{ status: "sent" | "queued" | "failed" }> {
  switch (channel) {
    case "email":
      return dispatchEmail(recipient, subject, body);
    case "sms":
      return dispatchSms(recipient, body);
    case "whatsapp":
      return dispatchWhatsApp(recipient, body);
  }
}

async function dispatchEmail(to: string, subject: string | null, body: string): Promise<{ status: "sent" | "queued" | "failed" }> {
  const env = getEnv();
  if (!env.RESEND_API_KEY) {
    logMissingProvider("email", `[notifications:email:dev] to=${to} subject=${subject ?? ""}\n${body}`);
    return { status: "queued" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM ?? "Dar Al Hay Events <no-reply@daralhay.ae>", to, subject, text: body }),
    });
    return { status: res.ok ? "sent" : "failed" };
  } catch (err) {
    console.error("Failed to send email", err);
    return { status: "failed" };
  }
}

async function dispatchSms(to: string, body: string): Promise<{ status: "sent" | "queued" | "failed" }> {
  const env = getEnv();
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_SMS_FROM) {
    logMissingProvider("sms", `[notifications:sms:dev] to=${to}\n${body}`);
    return { status: "queued" };
  }
  try {
    const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: env.TWILIO_SMS_FROM, Body: body }),
    });
    return { status: res.ok ? "sent" : "failed" };
  } catch (err) {
    console.error("Failed to send SMS", err);
    return { status: "failed" };
  }
}

async function dispatchWhatsApp(to: string, body: string): Promise<{ status: "sent" | "queued" | "failed" }> {
  const env = getEnv();
  if (!env.WHATSAPP_PROVIDER_TOKEN || !env.WHATSAPP_PHONE_ID || !env.WHATSAPP_GRAPH_API_VERSION) {
    logMissingProvider("whatsapp", `[notifications:whatsapp:dev] to=${to}\n${body}`);
    return { status: "queued" };
  }
  try {
    const res = await fetch(`https://graph.facebook.com/${env.WHATSAPP_GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WHATSAPP_PROVIDER_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
    });
    return { status: res.ok ? "sent" : "failed" };
  } catch (err) {
    console.error("Failed to send WhatsApp message", err);
    return { status: "failed" };
  }
}
