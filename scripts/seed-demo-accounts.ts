/**
 * Creates local-development-only demo accounts:
 *  - Two admin accounts (Saeed, Omar)
 *  - One approved demo vendor
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY, so it can only be run against a
 * Supabase project you control. Hosted projects require an explicit project
 * reference confirmation; production environments are always refused.
 *
 * Usage: npm run seed:demo
 */
import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
  console.error("Refusing to seed demo accounts against a production environment.");
  process.exit(1);
}
const targetUrl = (() => {
  try {
    return new URL(url);
  } catch {
    console.error("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
    process.exit(1);
  }
})();

const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);
const isLocalTarget = localHosts.has(targetUrl.hostname) || targetUrl.hostname.endsWith(".localhost");

if (!isLocalTarget) {
  const hostedMatch = /^([a-z0-9-]+)\.supabase\.co$/i.exec(targetUrl.hostname);
  const projectRef = hostedMatch?.[1] ?? null;
  const confirmedRef = process.env.SEED_DEMO_CONFIRM_PROJECT_REF?.trim();
  if (!projectRef || confirmedRef !== projectRef) {
    const confirmationHint = projectRef
      ? `Set SEED_DEMO_CONFIRM_PROJECT_REF=${projectRef} to confirm this exact hosted project.`
      : "Only standard <project-ref>.supabase.co hosted URLs can be explicitly confirmed.";
    console.error(`Refusing to seed a non-local Supabase target. ${confirmationHint}`);
    process.exit(1);
  }
}

const admin = createClient<Database>(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const demoPassword = `${randomBytes(24).toString("base64url")}aA1!`;

async function setDemoCredentials(userId: string, userMetadata: Record<string, string>) {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: demoPassword,
    user_metadata: userMetadata,
  });
  if (error) throw error;
}

async function upsertAdmin(email: string, fullName: string) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: demoPassword,
    email_confirm: true,
    user_metadata: { role: "admin", full_name: fullName },
  });

  let userId = created?.user?.id;

  if (error) {
    if (error.message.toLowerCase().includes("already been registered") || error.status === 422) {
      const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
      if (listError) throw listError;
      userId = list.users.find((u) => u.email === email)?.id;
    } else {
      throw error;
    }
  }

  if (!userId) throw new Error(`Could not resolve user id for ${email}`);

  await setDemoCredentials(userId, { role: "admin", full_name: fullName });
  const { error: profileError } = await admin.from("profiles").upsert({ id: userId, role: "admin", full_name: fullName });
  if (profileError) throw profileError;

  console.log(`Admin ready: ${email}`);
}

async function upsertDemoVendor() {
  const email = "demo.vendor@daralhay.test";
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: demoPassword,
    email_confirm: true,
    user_metadata: { role: "vendor", full_name: "Fatima Al Marzooqi" },
  });

  let userId = created?.user?.id;
  if (error) {
    if (error.message.toLowerCase().includes("already been registered") || error.status === 422) {
      const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
      if (listError) throw listError;
      userId = list.users.find((u) => u.email === email)?.id;
    } else {
      throw error;
    }
  }
  if (!userId) throw new Error("Could not resolve demo vendor user id");

  await setDemoCredentials(userId, { role: "vendor", full_name: "Fatima Al Marzooqi" });

  const { data: category, error: categoryError } = await admin.from("categories").select("id").eq("slug", "coffee-beverages").maybeSingle();
  if (categoryError) throw categoryError;

  const { error: businessError } = await admin.from("businesses").upsert(
    {
      owner_id: userId,
      business_name: "Bunn & Bloom Coffee",
      owner_name: "Fatima Al Marzooqi",
      email,
      phone: "+971501234567",
      instagram_username: "bunnandbloom",
      category_id: category?.id ?? null,
      description: "Specialty coffee cart serving Emirati-inspired seasonal drinks.",
      approval_status: "approved",
      submitted_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
    },
    { onConflict: "owner_id" }
  );
  if (businessError) throw businessError;

  console.log(`Demo vendor ready: ${email}`);
}

async function main() {
  await upsertAdmin("saeed@daralhay.test", "Saeed");
  await upsertAdmin("omar@daralhay.test", "Omar");
  await upsertDemoVendor();
  console.log(`\nTemporary password generated for this run: ${demoPassword}`);
  console.log("These accounts are for controlled demo use only; the password changes on every seed run.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
