import "server-only";

import { z } from "zod";

function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      (url.pathname === "/" || url.pathname === "") &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

const httpOriginSchema = z
  .string()
  .url()
  .refine(isHttpOrigin, "Must be an HTTP(S) origin without a path, query, or credentials.");

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: httpOriginSchema.optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SITE_URL: httpOriginSchema.optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_SMS_FROM: z.string().optional(),
  WHATSAPP_PROVIDER_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_ID: z.string().optional(),
  WHATSAPP_GRAPH_API_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/)
    .optional()
    .or(z.literal("")),
  ADCB_PACE_PAY_BASE_URL: z.string().optional(),
  ADCB_PACE_PAY_API_KEY: z.string().optional(),
  SEED_DEMO_CONFIRM_PROJECT_REF: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/**
 * Parses process.env once. Individual features (Supabase, email, SMS, WhatsApp,
 * ADCB) each check for their own keys at the point of use and fail with a clear
 * message rather than crashing the whole app — most pages (marketing homepage,
 * static content) don't need any of these to render.
 */
export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables. Check .env.example for the required shape.");
  }
  const hasSupabaseUrl = Boolean(parsed.data.NEXT_PUBLIC_SUPABASE_URL);
  const hasSupabaseAnonKey = Boolean(parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (hasSupabaseUrl !== hasSupabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be configured together."
    );
  }
  if (
    process.env.NODE_ENV === "production" &&
    hasSupabaseUrl &&
    !parsed.data.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required when Supabase is enabled in production.");
  }
  if (Boolean(parsed.data.RESEND_API_KEY) !== Boolean(parsed.data.EMAIL_FROM)) {
    throw new Error("RESEND_API_KEY and EMAIL_FROM must be configured together.");
  }
  const twilioValues = [
    parsed.data.TWILIO_ACCOUNT_SID,
    parsed.data.TWILIO_AUTH_TOKEN,
    parsed.data.TWILIO_SMS_FROM,
  ];
  if (twilioValues.some(Boolean) && !twilioValues.every(Boolean)) {
    throw new Error(
      "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_SMS_FROM must be configured together."
    );
  }
  const whatsappValues = [
    parsed.data.WHATSAPP_PROVIDER_TOKEN,
    parsed.data.WHATSAPP_PHONE_ID,
    parsed.data.WHATSAPP_GRAPH_API_VERSION,
  ];
  if (whatsappValues.some(Boolean) && !whatsappValues.every(Boolean)) {
    throw new Error(
      "WHATSAPP_PROVIDER_TOKEN, WHATSAPP_PHONE_ID, and WHATSAPP_GRAPH_API_VERSION must be configured together."
    );
  }
  if (process.env.NODE_ENV === "production") {
    if (
      parsed.data.NEXT_PUBLIC_SUPABASE_URL &&
      new URL(parsed.data.NEXT_PUBLIC_SUPABASE_URL).protocol !== "https:"
    ) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTPS in production.");
    }
    if (
      parsed.data.NEXT_PUBLIC_SITE_URL &&
      new URL(parsed.data.NEXT_PUBLIC_SITE_URL).protocol !== "https:"
    ) {
      throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS in production.");
    }
  }
  if (
    process.env.NODE_ENV === "production" &&
    hasSupabaseUrl &&
    !parsed.data.NEXT_PUBLIC_SITE_URL &&
    !process.env.VERCEL_URL
  ) {
    throw new Error("NEXT_PUBLIC_SITE_URL is required when Supabase is enabled in production.");
  }
  cached = parsed.data;
  return cached;
}

export function isSupabaseConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function requireSupabaseEnv() {
  const env = getEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example)."
    );
  }
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export function getSiteUrl() {
  const configuredUrl = getEnv().NEXT_PUBLIC_SITE_URL;
  if (configuredUrl) return new URL(configuredUrl).origin;

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return new URL(`https://${vercelUrl}`).origin;

  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_SITE_URL is required outside local development.");
  }

  return "http://localhost:3000";
}
