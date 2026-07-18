import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApprovalStatus, Database } from "@/types/database";
import type { ExportColumn } from "@/lib/export";
import { formatAED, formatUaePhoneDisplay, formatDate } from "@/lib/format";
import { APPLICATION_STATUS_LABELS, APPROVAL_STATUS_LABELS, BOOTH_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/constants";

type Client = SupabaseClient<Database>;

export interface ExportDataset {
  id: string;
  label: string;
  requiresEvent: boolean;
  columns: ExportColumn[];
  fetch: (supabase: Client, eventId?: string) => Promise<Record<string, unknown>[]>;
}

const businessColumns: ExportColumn[] = [
  { key: "business_name", label: "Business Name" },
  { key: "owner_name", label: "Owner Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "instagram_username", label: "Instagram" },
  { key: "category", label: "Category" },
  { key: "approval_status", label: "Status" },
  { key: "created_at", label: "Joined" },
];

async function fetchBusinesses(supabase: Client, statusFilter?: ApprovalStatus) {
  let query = supabase.from("businesses").select("*, categories(name)").order("created_at", { ascending: false });
  if (statusFilter) query = query.eq("approval_status", statusFilter);
  const { data } = await query;
  return (data ?? []).map((b) => ({
    business_name: b.business_name,
    owner_name: b.owner_name,
    email: b.email,
    phone: formatUaePhoneDisplay(b.phone),
    instagram_username: b.instagram_username ? `@${b.instagram_username}` : "",
    category: (b as unknown as { categories: { name: string } | null }).categories?.name ?? "",
    approval_status: APPROVAL_STATUS_LABELS[b.approval_status] ?? b.approval_status,
    created_at: formatDate(b.created_at),
  }));
}

export const EXPORT_DATASETS: ExportDataset[] = [
  {
    id: "all_vendors",
    label: "All vendor accounts",
    requiresEvent: false,
    columns: businessColumns,
    fetch: (supabase) => fetchBusinesses(supabase),
  },
  {
    id: "approved_vendors",
    label: "Approved vendors",
    requiresEvent: false,
    columns: businessColumns,
    fetch: (supabase) => fetchBusinesses(supabase, "approved"),
  },
  {
    id: "rejected_vendors",
    label: "Rejected vendors",
    requiresEvent: false,
    columns: [...businessColumns, { key: "rejection_reason", label: "Reason" }],
    fetch: async (supabase) => {
      const rows = await fetchBusinesses(supabase, "rejected");
      const { data } = await supabase.from("businesses").select("email, rejection_reason").eq("approval_status", "rejected");
      const reasonByEmail = new Map((data ?? []).map((r) => [r.email, r.rejection_reason]));
      return rows.map((r) => ({ ...r, rejection_reason: reasonByEmail.get(r.email as string) ?? "" }));
    },
  },
  {
    id: "contact_list",
    label: "Contact list (email, phone, Instagram)",
    requiresEvent: false,
    columns: [
      { key: "business_name", label: "Business Name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "instagram_username", label: "Instagram" },
    ],
    fetch: (supabase) => fetchBusinesses(supabase),
  },
  {
    id: "waiting_list",
    label: "Waiting-list vendors",
    requiresEvent: true,
    columns: [
      { key: "business_name", label: "Business Name" },
      { key: "category", label: "Category" },
      { key: "preferred_booth_size", label: "Preferred Size" },
      { key: "max_budget", label: "Max Budget" },
      { key: "priority", label: "Priority" },
      { key: "status", label: "Status" },
      { key: "joined_at", label: "Joined" },
    ],
    fetch: async (supabase, eventId) => {
      const { data } = await supabase
        .from("waiting_list")
        .select("*, businesses(business_name, categories(name))")
        .eq("event_id", eventId as string)
        .order("priority", { ascending: false });
      return (data ?? []).map((w) => {
        const business = w.businesses as unknown as { business_name: string; categories: { name: string } | null } | null;
        return {
          business_name: business?.business_name ?? "",
          category: business?.categories?.name ?? "",
          preferred_booth_size: w.preferred_booth_size ?? "",
          max_budget: w.max_budget !== null ? formatAED(w.max_budget) : "",
          priority: w.priority,
          status: w.status,
          joined_at: formatDate(w.joined_at),
        };
      });
    },
  },
  {
    id: "booth_assignments",
    label: "Booth assignments",
    requiresEvent: true,
    columns: [
      { key: "booth_number", label: "Booth" },
      { key: "business_name", label: "Business" },
      { key: "status", label: "Application Status" },
      { key: "total_amount", label: "Total (AED)" },
    ],
    fetch: async (supabase, eventId) => {
      const { data } = await supabase
        .from("applications")
        .select("status, total_amount, booths(booth_number), businesses(business_name)")
        .eq("event_id", eventId as string)
        .not("booth_id", "is", null);
      return (data ?? []).map((a) => {
        const booth = a.booths as unknown as { booth_number: string } | null;
        const business = a.businesses as unknown as { business_name: string } | null;
        return {
          booth_number: booth?.booth_number ?? "",
          business_name: business?.business_name ?? "",
          status: APPLICATION_STATUS_LABELS[a.status] ?? a.status,
          total_amount: formatAED(a.total_amount),
        };
      });
    },
  },
  {
    id: "booth_availability",
    label: "Booth availability",
    requiresEvent: true,
    columns: [
      { key: "booth_number", label: "Booth" },
      { key: "status", label: "Status" },
      { key: "price_before_vat", label: "Price (AED)" },
      { key: "zone", label: "Zone" },
    ],
    fetch: async (supabase, eventId) => {
      const { data } = await supabase.from("booths").select("*, zones(name)").eq("event_id", eventId as string).order("booth_number");
      return (data ?? []).map((b) => ({
        booth_number: b.booth_number,
        status: BOOTH_STATUS_LABELS[b.status] ?? b.status,
        price_before_vat: formatAED(b.price_before_vat),
        zone: (b as unknown as { zones: { name: string } | null }).zones?.name ?? "",
      }));
    },
  },
  {
    id: "payments",
    label: "Payments",
    requiresEvent: true,
    columns: [
      { key: "business_name", label: "Business" },
      { key: "method", label: "Method" },
      { key: "status", label: "Status" },
      { key: "amount", label: "Amount (AED)" },
      { key: "transfer_reference", label: "Reference" },
    ],
    fetch: async (supabase, eventId) => {
      const { data } = await supabase
        .from("payments")
        .select("*, applications!inner(event_id, businesses(business_name))")
        .eq("applications.event_id", eventId as string);
      return (data ?? []).map((p) => {
        const application = p.applications as unknown as { businesses: { business_name: string } | null };
        return {
          business_name: application?.businesses?.business_name ?? "",
          method: p.method ?? "",
          status: PAYMENT_STATUS_LABELS[p.status] ?? p.status,
          amount: formatAED(p.amount),
          transfer_reference: p.transfer_reference ?? p.payment_reference ?? "",
        };
      });
    },
  },
  {
    id: "pending_payments",
    label: "Pending payments",
    requiresEvent: true,
    columns: [
      { key: "business_name", label: "Business" },
      { key: "status", label: "Status" },
      { key: "amount", label: "Amount (AED)" },
      { key: "deadline_at", label: "Deadline" },
    ],
    fetch: async (supabase, eventId) => {
      const { data } = await supabase
        .from("payments")
        .select("*, applications!inner(event_id, businesses(business_name))")
        .eq("applications.event_id", eventId as string)
        .in("status", ["payment_required", "pending_payment", "pending_verification"]);
      return (data ?? []).map((p) => {
        const application = p.applications as unknown as { businesses: { business_name: string } | null };
        return {
          business_name: application?.businesses?.business_name ?? "",
          status: PAYMENT_STATUS_LABELS[p.status] ?? p.status,
          amount: formatAED(p.amount),
          deadline_at: p.deadline_at ? formatDate(p.deadline_at) : "",
        };
      });
    },
  },
  {
    id: "revenue_report",
    label: "Revenue report (paid)",
    requiresEvent: true,
    columns: [
      { key: "business_name", label: "Business" },
      { key: "booth_number", label: "Booth" },
      { key: "amount", label: "Amount (AED)" },
      { key: "verified_at", label: "Confirmed" },
    ],
    fetch: async (supabase, eventId) => {
      const { data } = await supabase
        .from("payments")
        .select("amount, verified_at, applications!inner(event_id, businesses(business_name), booths(booth_number))")
        .eq("applications.event_id", eventId as string)
        .eq("status", "paid");
      return (data ?? []).map((p) => {
        const application = p.applications as unknown as {
          businesses: { business_name: string } | null;
          booths: { booth_number: string } | null;
        };
        return {
          business_name: application?.businesses?.business_name ?? "",
          booth_number: application?.booths?.booth_number ?? "",
          amount: formatAED(p.amount),
          verified_at: formatDate(p.verified_at),
        };
      });
    },
  },
  {
    id: "category_breakdown",
    label: "Category breakdown",
    requiresEvent: true,
    columns: [
      { key: "category", label: "Category" },
      { key: "applications", label: "Applications" },
    ],
    fetch: async (supabase, eventId) => {
      const { data } = await supabase
        .from("applications")
        .select("businesses(categories(name))")
        .eq("event_id", eventId as string);
      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        const business = row.businesses as unknown as { categories: { name: string } | null } | null;
        const name = business?.categories?.name ?? "Uncategorized";
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      return Array.from(counts.entries()).map(([category, applications]) => ({ category, applications }));
    },
  },
  {
    id: "setup_day_list",
    label: "Setup-day list",
    requiresEvent: true,
    columns: [
      { key: "booth_number", label: "Booth" },
      { key: "business_name", label: "Business" },
      { key: "phone", label: "Phone" },
      { key: "final_approval", label: "Setup Approved" },
    ],
    fetch: async (supabase, eventId) => {
      const { data } = await supabase
        .from("applications")
        .select("businesses(business_name, phone), booths(booth_number), setup_checklists(final_approval)")
        .eq("event_id", eventId as string)
        .eq("status", "confirmed");
      return (data ?? []).map((a) => {
        const business = a.businesses as unknown as { business_name: string; phone: string } | null;
        const booth = a.booths as unknown as { booth_number: string } | null;
        const checklist = a.setup_checklists as unknown as { final_approval: boolean } | null;
        return {
          booth_number: booth?.booth_number ?? "",
          business_name: business?.business_name ?? "",
          phone: business ? formatUaePhoneDisplay(business.phone) : "",
          final_approval: checklist?.final_approval ? "Yes" : "No",
        };
      });
    },
  },
];

export function getDataset(id: string): ExportDataset | undefined {
  return EXPORT_DATASETS.find((d) => d.id === id);
}
