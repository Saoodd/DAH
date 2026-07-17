/**
 * Creates local-development-only demo accounts:
 *  - Two admin accounts (Saeed, Omar)
 *  - One approved demo vendor
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY, so it can only be run against a
 * Supabase project you control — never point this at production without
 * changing the passwords immediately after.
 *
 * Usage: npm run seed:demo
 */
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

const admin = createClient<Database>(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_PASSWORD = "DarAlHay#2025";

async function upsertAdmin(email: string, fullName: string) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "admin", full_name: fullName },
  });

  let userId = created?.user?.id;

  if (error) {
    if (error.message.toLowerCase().includes("already been registered") || error.status === 422) {
      const { data: list } = await admin.auth.admin.listUsers();
      userId = list.users.find((u) => u.email === email)?.id;
    } else {
      throw error;
    }
  }

  if (!userId) throw new Error(`Could not resolve user id for ${email}`);

  await admin.from("profiles").upsert({ id: userId, role: "admin", full_name: fullName });
  console.log(`Admin ready: ${email} / ${DEMO_PASSWORD}`);
}

async function upsertDemoVendor() {
  const email = "demo.vendor@daralhay.test";
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { role: "vendor", full_name: "Fatima Al Marzooqi" },
  });

  let userId = created?.user?.id;
  if (error) {
    if (error.message.toLowerCase().includes("already been registered") || error.status === 422) {
      const { data: list } = await admin.auth.admin.listUsers();
      userId = list.users.find((u) => u.email === email)?.id;
    } else {
      throw error;
    }
  }
  if (!userId) throw new Error("Could not resolve demo vendor user id");

  const { data: category } = await admin.from("categories").select("id").eq("slug", "coffee-beverages").maybeSingle();

  await admin.from("businesses").upsert(
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

  console.log(`Demo vendor ready: ${email} / ${DEMO_PASSWORD}`);
}

async function main() {
  await upsertAdmin("saeed@daralhay.test", "Saeed");
  await upsertAdmin("omar@daralhay.test", "Omar");
  await upsertDemoVendor();
  console.log("\nDone. These accounts are for local development only — never reuse this password in production.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
