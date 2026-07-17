-- Dar Al Hay Vendor Management Platform — initial schema
-- Covers the full platform (Phases 1-6). Built once so later phases only add
-- application logic, not risky incremental schema churn.

create extension if not exists "pgcrypto";

-- =========================================================================
-- Helper: updated_at trigger
-- =========================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================================
-- Roles & profiles (1 row per auth.users, created by trigger on signup)
-- =========================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'vendor' check (role in ('vendor', 'admin')),
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- =========================================================================
-- Categories (admin-configurable business categories, used for recs too)
-- =========================================================================
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Businesses — the permanent vendor profile. One per vendor account.
-- =========================================================================
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  business_name text not null,
  owner_name text not null,
  email text not null unique,
  phone text not null unique,
  instagram_username text,
  category_id uuid references public.categories(id),
  description text,
  logo_url text,
  trade_license_url text,
  product_photo_urls text[] not null default '{}',
  approval_status text not null default 'profile_incomplete' check (
    approval_status in (
      'profile_incomplete', 'pending_review', 'approved',
      'rejected', 'suspended', 'blacklisted'
    )
  ),
  rejection_reason text,
  requires_reapproval boolean not null default false,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  last_profile_update timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index businesses_approval_status_idx on public.businesses(approval_status);
create index businesses_category_idx on public.businesses(category_id);

create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

-- =========================================================================
-- Events
-- =========================================================================
create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  location text,
  description text,
  vendor_rules text,
  setup_instructions text,
  banner_url text,
  start_at timestamptz,
  end_at timestamptz,
  setup_start_at timestamptz,
  setup_end_at timestamptz,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  registration_status text not null default 'draft' check (
    registration_status in ('draft', 'open', 'closed', 'archived')
  ),
  payment_deadline_minutes int not null default 60,
  booth_lock_minutes int not null default 5,
  recommendations_enabled boolean not null default true,
  booth_changes_locked boolean not null default false,
  is_archived boolean not null default false,
  duplicated_from uuid references public.events(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enforce at most one event open for registration at a time.
create unique index events_single_open_idx on public.events ((registration_status))
  where registration_status = 'open';

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- =========================================================================
-- Zones (per event)
-- =========================================================================
create table public.zones (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  color text not null default '#6B7280',
  description text,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Map features (entrances, exits, stage, loading bay, etc. — non-bookable)
-- =========================================================================
create table public.map_features (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  type text not null check (type in (
    'entrance', 'exit', 'loading_bay', 'main_stage', 'food_section',
    'clothing_section', 'coffee_area', 'electrical_point', 'restroom', 'other'
  )),
  label text,
  map_x numeric not null default 0,
  map_y numeric not null default 0,
  map_width numeric not null default 1,
  map_height numeric not null default 1,
  rotation numeric not null default 0,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Booths
-- =========================================================================
create table public.booths (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  zone_id uuid references public.zones(id) on delete set null,
  booth_number text not null,
  size_label text,
  map_x numeric not null default 0,
  map_y numeric not null default 0,
  map_width numeric not null default 1,
  map_height numeric not null default 1,
  rotation numeric not null default 0,
  price_before_vat numeric(10, 2) not null default 0,
  status text not null default 'available' check (status in (
    'available', 'locked', 'reserved', 'awaiting_payment',
    'confirmed', 'admin_held', 'blocked', 'unavailable'
  )),
  feature_tags text[] not null default '{}',
  distance_from_entrance numeric,
  suitable_category_ids uuid[] not null default '{}',
  admin_notes text,
  held_for_business_id uuid references public.businesses(id) on delete set null,
  locked_by_business_id uuid references public.businesses(id) on delete set null,
  lock_expires_at timestamptz,
  current_application_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, booth_number)
);

create index booths_event_status_idx on public.booths(event_id, status);
create index booths_lock_expiry_idx on public.booths(lock_expires_at) where lock_expires_at is not null;

create trigger booths_set_updated_at
  before update on public.booths
  for each row execute function public.set_updated_at();

-- =========================================================================
-- Category / zone recommendation rules (rule-based, admin configurable)
-- =========================================================================
create table public.category_zone_rules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  preferred_zone_id uuid references public.zones(id) on delete set null,
  preferred_feature_tags text[] not null default '{}',
  avoid_adjacent_same_category boolean not null default false,
  max_per_zone int,
  created_at timestamptz not null default now(),
  unique (event_id, category_id)
);

-- =========================================================================
-- Applications (one per business per event)
-- =========================================================================
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  status text not null default 'not_started' check (status in (
    'not_started', 'draft', 'submitted', 'under_review', 'approved',
    'booth_selection_available', 'booth_selected', 'awaiting_payment',
    'payment_under_review', 'confirmed', 'rejected', 'cancelled', 'expired'
  )),
  booth_id uuid references public.booths(id) on delete set null,
  booth_price_before_vat numeric(10, 2),
  vat_amount numeric(10, 2),
  total_amount numeric(10, 2),
  booth_access_granted_at timestamptz,
  booth_access_reason text,
  admin_notes text,
  rejection_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, business_id)
);

create index applications_event_status_idx on public.applications(event_id, status);
create index applications_business_idx on public.applications(business_id);

alter table public.booths
  add constraint booths_current_application_fkey
  foreign key (current_application_id) references public.applications(id) on delete set null;

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- =========================================================================
-- Booth change log (section 7 audit trail)
-- =========================================================================
create table public.booth_change_log (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  old_booth_id uuid references public.booths(id) on delete set null,
  new_booth_id uuid references public.booths(id) on delete set null,
  old_price numeric(10, 2),
  new_price numeric(10, 2),
  changed_by uuid references public.profiles(id),
  reason text,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Booth history (section 9 — full history of every booth)
-- =========================================================================
create table public.booth_events (
  id uuid primary key default gen_random_uuid(),
  booth_id uuid not null references public.booths(id) on delete cascade,
  event_type text not null check (event_type in (
    'locked', 'lock_extended', 'released', 'expired', 'reserved',
    'awaiting_payment', 'confirmed', 'admin_held', 'admin_released',
    'swapped', 'price_changed', 'status_changed', 'note_added', 'blocked', 'unblocked'
  )),
  business_id uuid references public.businesses(id) on delete set null,
  actor_id uuid references public.profiles(id),
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index booth_events_booth_idx on public.booth_events(booth_id, created_at desc);

-- =========================================================================
-- Bank details (IBAN payment info, configurable per event or global)
-- =========================================================================
create table public.bank_details (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  bank_name text not null,
  account_name text not null,
  iban text not null,
  swift_code text,
  notes text,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Payments
-- =========================================================================
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  method text check (method in ('adcb_pace_pay', 'bank_transfer', 'offline', 'other')),
  status text not null default 'not_requested' check (status in (
    'not_requested', 'payment_required', 'pending_payment', 'receipt_uploaded',
    'pending_verification', 'paid', 'failed', 'expired', 'refunded', 'partially_refunded'
  )),
  amount numeric(10, 2),
  payment_link text,
  payment_reference text,
  receipt_url text,
  transfer_reference text,
  transfer_date date,
  deadline_at timestamptz,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  rejection_reason text,
  refund_amount numeric(10, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_application_idx on public.payments(application_id);
create index payments_status_idx on public.payments(status);
create index payments_deadline_idx on public.payments(deadline_at) where deadline_at is not null;

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- =========================================================================
-- Waiting list
-- =========================================================================
create table public.waiting_list (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  preferred_booth_size text,
  max_budget numeric(10, 2),
  preferred_zone_id uuid references public.zones(id),
  priority int not null default 0,
  admin_notes text,
  status text not null default 'waiting' check (status in (
    'waiting', 'invited', 'accepted', 'declined', 'expired', 'removed'
  )),
  invited_booth_id uuid references public.booths(id),
  invitation_expires_at timestamptz,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, business_id)
);

create trigger waiting_list_set_updated_at
  before update on public.waiting_list
  for each row execute function public.set_updated_at();

-- =========================================================================
-- Notification templates + delivery log
-- =========================================================================
create table public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  subject text,
  body text not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (key, channel)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  template_key text,
  recipient text,
  subject text,
  body text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed')),
  provider_response jsonb,
  sent_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index notifications_business_idx on public.notifications(business_id, created_at desc);

-- =========================================================================
-- Setup-day checklist
-- =========================================================================
create table public.setup_checklists (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  vendor_arrived boolean not null default false,
  identity_confirmed boolean not null default false,
  booth_number_confirmed boolean not null default false,
  products_match_category boolean not null default false,
  setup_follows_dimensions boolean not null default false,
  electrical_checked boolean not null default false,
  no_blocked_aisles boolean not null default false,
  safety_check_completed boolean not null default false,
  booth_appearance_approved boolean not null default false,
  final_approval boolean not null default false,
  issue_found text,
  issue_resolved boolean not null default false,
  checkin_time timestamptz,
  photo_url text,
  notes text,
  checked_by uuid references public.profiles(id),
  qr_code text unique,
  updated_at timestamptz not null default now()
);

create trigger setup_checklists_set_updated_at
  before update on public.setup_checklists
  for each row execute function public.set_updated_at();

-- =========================================================================
-- Audit logs (platform-wide, section 18)
-- =========================================================================
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  previous_value jsonb,
  new_value jsonb,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs(actor_id);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

-- =========================================================================
-- Auto-create profile row on signup
-- =========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'vendor'),
    new.raw_user_meta_data ->> 'full_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- Row Level Security
-- =========================================================================
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.businesses enable row level security;
alter table public.events enable row level security;
alter table public.zones enable row level security;
alter table public.map_features enable row level security;
alter table public.booths enable row level security;
alter table public.category_zone_rules enable row level security;
alter table public.applications enable row level security;
alter table public.booth_change_log enable row level security;
alter table public.booth_events enable row level security;
alter table public.bank_details enable row level security;
alter table public.payments enable row level security;
alter table public.waiting_list enable row level security;
alter table public.notification_templates enable row level security;
alter table public.notifications enable row level security;
alter table public.setup_checklists enable row level security;
alter table public.audit_logs enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Helper: business id owned by the current user, if any
create or replace function public.owned_business_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.businesses where owner_id = auth.uid();
$$;

-- Pre-signup availability checks (narrow, no data leakage — booleans only)
create or replace function public.check_email_available(p_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (select 1 from public.businesses where lower(email) = lower(p_email));
$$;

create or replace function public.check_phone_available(p_phone text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (select 1 from public.businesses where phone = p_phone);
$$;

grant execute on function public.check_email_available(text) to anon, authenticated;
grant execute on function public.check_phone_available(text) to anon, authenticated;

-- profiles: users see their own row; admins see all
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- categories: public read, admin write
create policy "categories_select_all" on public.categories for select using (true);
create policy "categories_admin_write" on public.categories for all using (public.is_admin()) with check (public.is_admin());

-- businesses: owner + admin
create policy "businesses_select_own_or_admin" on public.businesses
  for select using (owner_id = auth.uid() or public.is_admin());
create policy "businesses_insert_own" on public.businesses
  for insert with check (owner_id = auth.uid());
create policy "businesses_update_own_or_admin" on public.businesses
  for update using (owner_id = auth.uid() or public.is_admin());
create policy "businesses_delete_admin" on public.businesses
  for delete using (public.is_admin());

-- events: approved vendors + admins can read; only admins write
create policy "events_select_all_authenticated" on public.events
  for select using (auth.role() = 'authenticated');
create policy "events_admin_write" on public.events for all using (public.is_admin()) with check (public.is_admin());

-- zones / map_features: readable by authenticated, admin write
create policy "zones_select_all" on public.zones for select using (auth.role() = 'authenticated');
create policy "zones_admin_write" on public.zones for all using (public.is_admin()) with check (public.is_admin());
create policy "map_features_select_all" on public.map_features for select using (auth.role() = 'authenticated');
create policy "map_features_admin_write" on public.map_features for all using (public.is_admin()) with check (public.is_admin());

-- booths: readable by authenticated (needed for live floor plan), admin write.
-- Mutations to lock/select booths happen via SECURITY DEFINER RPC functions (phase 3),
-- not direct table writes, so vendor UPDATE is intentionally not granted here.
create policy "booths_select_all" on public.booths for select using (auth.role() = 'authenticated');
create policy "booths_admin_write" on public.booths for all using (public.is_admin()) with check (public.is_admin());

create policy "category_zone_rules_select_all" on public.category_zone_rules for select using (auth.role() = 'authenticated');
create policy "category_zone_rules_admin_write" on public.category_zone_rules for all using (public.is_admin()) with check (public.is_admin());

-- applications: owner business + admin
create policy "applications_select_own_or_admin" on public.applications
  for select using (business_id = public.owned_business_id() or public.is_admin());
create policy "applications_insert_own" on public.applications
  for insert with check (business_id = public.owned_business_id());
create policy "applications_update_own_or_admin" on public.applications
  for update using (business_id = public.owned_business_id() or public.is_admin());

create policy "booth_change_log_select_own_or_admin" on public.booth_change_log
  for select using (
    public.is_admin() or application_id in (
      select id from public.applications where business_id = public.owned_business_id()
    )
  );
create policy "booth_change_log_admin_write" on public.booth_change_log for all using (public.is_admin()) with check (public.is_admin());

create policy "booth_events_select_admin" on public.booth_events for select using (public.is_admin());
create policy "booth_events_admin_write" on public.booth_events for all using (public.is_admin()) with check (public.is_admin());

create policy "bank_details_select_authenticated" on public.bank_details for select using (auth.role() = 'authenticated');
create policy "bank_details_admin_write" on public.bank_details for all using (public.is_admin()) with check (public.is_admin());

-- payments: owner business + admin
create policy "payments_select_own_or_admin" on public.payments
  for select using (
    public.is_admin() or application_id in (
      select id from public.applications where business_id = public.owned_business_id()
    )
  );
create policy "payments_update_own_or_admin" on public.payments
  for update using (
    public.is_admin() or application_id in (
      select id from public.applications where business_id = public.owned_business_id()
    )
  );
create policy "payments_admin_insert" on public.payments for insert with check (public.is_admin());

-- waiting_list: owner + admin
create policy "waiting_list_select_own_or_admin" on public.waiting_list
  for select using (business_id = public.owned_business_id() or public.is_admin());
create policy "waiting_list_insert_own" on public.waiting_list
  for insert with check (business_id = public.owned_business_id());
create policy "waiting_list_update_own_or_admin" on public.waiting_list
  for update using (business_id = public.owned_business_id() or public.is_admin());

-- notification_templates: admin only
create policy "notification_templates_admin_all" on public.notification_templates for all using (public.is_admin()) with check (public.is_admin());

-- notifications: owner can read own, admin all
create policy "notifications_select_own_or_admin" on public.notifications
  for select using (business_id = public.owned_business_id() or public.is_admin());
create policy "notifications_admin_write" on public.notifications for all using (public.is_admin()) with check (public.is_admin());

-- setup_checklists: admin only (internal ops tool)
create policy "setup_checklists_admin_all" on public.setup_checklists for all using (public.is_admin()) with check (public.is_admin());

-- audit_logs: admin only
create policy "audit_logs_select_admin" on public.audit_logs for select using (public.is_admin());
create policy "audit_logs_insert_authenticated" on public.audit_logs for insert with check (auth.role() = 'authenticated');
