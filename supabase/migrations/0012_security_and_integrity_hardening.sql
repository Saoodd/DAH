-- Security and integrity hardening.
--
-- This migration deliberately leaves all earlier migrations untouched. RPC
-- signatures used by the application remain compatible, but untrusted values
-- (notably lock durations and storage paths) are no longer authoritative.

-- =========================================================================
-- Signup and audit-log privilege boundaries
-- =========================================================================

-- Never trust signup metadata for authorization. The only supported way to
-- promote a user remains an authenticated admin updating public.profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    'vendor',
    nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), '')
  );
  return new;
end;
$$;

-- Audit rows are privileged records, not vendor-authored content. Application
-- code that needs to write them must use a trusted service-role path.
drop policy if exists "audit_logs_insert_authenticated" on public.audit_logs;
drop policy if exists "audit_logs_insert_self_or_admin" on public.audit_logs;
revoke insert on table public.audit_logs from anon, authenticated;

-- =========================================================================
-- Storage bucket enforcement
-- =========================================================================

-- Supabase Storage enforces these standard bucket metadata fields before an
-- object is accepted. Re-running the migration produces the same values.
update storage.buckets
set file_size_limit = 3145728, -- 3 MiB
    allowed_mime_types = array[
      'image/png', 'image/jpeg', 'image/webp'
    ]::text[]
where id = 'business-logos';

update storage.buckets
set file_size_limit = 5242880, -- 5 MiB
    allowed_mime_types = array[
      'image/png', 'image/jpeg', 'image/webp'
    ]::text[]
where id = 'product-photos';

update storage.buckets
set file_size_limit = 5242880, -- 5 MiB
    allowed_mime_types = array[
      'image/png', 'image/jpeg', 'image/webp'
    ]::text[]
where id = 'event-banners';

update storage.buckets
set file_size_limit = 8388608, -- 8 MiB
    allowed_mime_types = array[
      'image/png', 'image/jpeg', 'image/webp', 'application/pdf'
    ]::text[]
where id = 'trade-licenses';

update storage.buckets
set file_size_limit = 8388608, -- 8 MiB
    allowed_mime_types = array[
      'image/png', 'image/jpeg', 'image/webp', 'application/pdf'
    ]::text[]
where id = 'payment-receipts';

update storage.buckets
set file_size_limit = 5242880, -- 5 MiB
    allowed_mime_types = array[
      'image/png', 'image/jpeg', 'image/webp'
    ]::text[]
where id = 'setup-photos';


-- =========================================================================
-- Deploy-safe integrity constraints
-- =========================================================================

-- NOT VALID avoids scanning or rewriting legacy rows during deployment while
-- still enforcing each invariant for new and subsequently changed rows. A
-- staging data audit should precede a later VALIDATE CONSTRAINT.
do $migration$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = pg_catalog.to_regclass('public.events')
      and conname = 'events_booth_lock_minutes_range'
  ) then
    alter table public.events
      add constraint events_booth_lock_minutes_range
      check (booth_lock_minutes between 1 and 120) not valid;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = pg_catalog.to_regclass('public.events')
      and conname = 'events_payment_deadline_minutes_range'
  ) then
    alter table public.events
      add constraint events_payment_deadline_minutes_range
      check (payment_deadline_minutes between 5 and 10080) not valid;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = pg_catalog.to_regclass('public.events')
      and conname = 'events_chronological_range'
  ) then
    alter table public.events
      add constraint events_chronological_range
      check (start_at is null or end_at is null or start_at < end_at) not valid;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = pg_catalog.to_regclass('public.events')
      and conname = 'events_setup_chronological_range'
  ) then
    alter table public.events
      add constraint events_setup_chronological_range
      check (
        setup_start_at is null
        or setup_end_at is null
        or setup_start_at < setup_end_at
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = pg_catalog.to_regclass('public.events')
      and conname = 'events_registration_chronological_range'
  ) then
    alter table public.events
      add constraint events_registration_chronological_range
      check (
        registration_opens_at is null
        or registration_closes_at is null
        or registration_opens_at < registration_closes_at
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = pg_catalog.to_regclass('public.waiting_list')
      and conname = 'waiting_list_max_budget_nonnegative'
  ) then
    alter table public.waiting_list
      add constraint waiting_list_max_budget_nonnegative
      check (
        max_budget is null
        or (max_budget::text <> 'NaN' and max_budget >= 0)
      ) not valid;
  end if;
end;
$migration$;

-- =========================================================================
-- Business profile reapproval
-- =========================================================================

-- Keep the existing signature for generated clients. p_email is accepted only
-- for compatibility and must equal the stored value; changing the account
-- email belongs to a separate, verified auth flow.
create or replace function public.update_business_profile(
  p_business_name text,
  p_owner_name text,
  p_email text,
  p_phone text,
  p_instagram_username text,
  p_category_id uuid,
  p_description text,
  p_logo_url text default null,
  p_trade_license_url text default null,
  p_new_product_photo_urls text[] default null
)
returns public.businesses
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_business_id uuid;
  v_owner_id uuid := auth.uid();
  v_logo_path text;
  v_photo_url text;
  v_photo_path text;
  v_business public.businesses;
  v_business_name text := pg_catalog.btrim(p_business_name);
  v_owner_name text := pg_catalog.btrim(p_owner_name);
  v_phone text := pg_catalog.btrim(p_phone);
  v_instagram text := nullif(pg_catalog.btrim(p_instagram_username), '');
  v_description text := pg_catalog.btrim(p_description);
  v_new_product_urls text[];
  v_material_change boolean;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_business_id := public.owned_business_id();
  if v_business_id is null then
    raise exception 'NO_BUSINESS' using errcode = 'P0001';
  end if;

  select b.*
  into v_business
  from public.businesses b
  where b.id = v_business_id
  for update;

  if not found then
    raise exception 'NO_BUSINESS' using errcode = 'P0001';
  end if;

  if p_email is null
     or pg_catalog.lower(pg_catalog.btrim(p_email))
        <> pg_catalog.lower(v_business.email)
  then
    raise exception 'EMAIL_IMMUTABLE' using errcode = 'P0001';
  end if;

  if v_business_name is null
     or pg_catalog.char_length(v_business_name) not between 2 and 120
     or v_owner_name is null
     or pg_catalog.char_length(v_owner_name) not between 2 and 120
     or v_phone is null
     or pg_catalog.char_length(v_phone) not between 7 and 30
     or v_description is null
     or pg_catalog.char_length(v_description) not between 10 and 600
  then
    raise exception 'INVALID_BUSINESS_PROFILE' using errcode = 'P0001';
  end if;

  if v_instagram is not null
     and (
       pg_catalog.char_length(v_instagram) > 30
       or v_instagram !~ '^[A-Za-z0-9._]+$'
     )
  then
    raise exception 'INVALID_INSTAGRAM_USERNAME' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.categories c
    where c.id = p_category_id
  ) then
    raise exception 'INVALID_CATEGORY' using errcode = 'P0001';
  end if;

  if p_logo_url is not null then
    if pg_catalog.char_length(p_logo_url) > 2048
       or p_logo_url ~ '[[:cntrl:]]'
       or p_logo_url !~ '^https?://'
       or pg_catalog.strpos(
         p_logo_url,
         '/storage/v1/object/public/business-logos/'
       ) = 0
    then
      raise exception 'INVALID_LOGO_URL' using errcode = 'P0001';
    end if;

    v_logo_path := pg_catalog.substr(
      p_logo_url,
      pg_catalog.strpos(
        p_logo_url,
        '/storage/v1/object/public/business-logos/'
      )
      + pg_catalog.char_length(
        '/storage/v1/object/public/business-logos/'
      )
    );

    if v_logo_path !~ ('^' || v_owner_id::text || '/[^/]{1,255}$')
       or v_logo_path ~ '[?#]'
       or not exists (
         select 1
         from storage.objects o
         where o.bucket_id = 'business-logos'
           and o.name = v_logo_path
       )
    then
      raise exception 'LOGO_NOT_OWNED' using errcode = 'P0001';
    end if;
  end if;

  if p_trade_license_url is not null then
    if pg_catalog.char_length(p_trade_license_url) not between 38 and 512
       or p_trade_license_url !~ (
         '^' || v_owner_id::text || '/[^/]{1,255}$'
       )
       or p_trade_license_url ~ '(^|/)\.\.?(/|$)'
       or p_trade_license_url ~ '[[:cntrl:]]'
       or pg_catalog.strpos(
         p_trade_license_url,
         pg_catalog.chr(92)
       ) > 0
    then
      raise exception 'INVALID_TRADE_LICENSE_PATH' using errcode = 'P0001';
    end if;

    if not exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'trade-licenses'
        and o.name = p_trade_license_url
    ) then
      raise exception 'TRADE_LICENSE_NOT_OWNED' using errcode = 'P0001';
    end if;
  end if;

  if p_new_product_photo_urls is not null then
    if pg_catalog.cardinality(p_new_product_photo_urls) > 6
       or pg_catalog.array_position(
         p_new_product_photo_urls,
         null
       ) is not null
    then
      raise exception 'INVALID_PRODUCT_PHOTOS' using errcode = 'P0001';
    end if;

    for v_photo_url in
      select photo_url
      from pg_catalog.unnest(p_new_product_photo_urls) as photo_url
    loop
      if pg_catalog.char_length(v_photo_url) > 2048
         or v_photo_url ~ '[[:cntrl:]]'
         or v_photo_url !~ '^https?://'
         or pg_catalog.strpos(
           v_photo_url,
           '/storage/v1/object/public/product-photos/'
         ) = 0
      then
        raise exception 'INVALID_PRODUCT_PHOTOS' using errcode = 'P0001';
      end if;

      v_photo_path := pg_catalog.substr(
        v_photo_url,
        pg_catalog.strpos(
          v_photo_url,
          '/storage/v1/object/public/product-photos/'
        )
        + pg_catalog.char_length(
          '/storage/v1/object/public/product-photos/'
        )
      );

      if v_photo_path !~ ('^' || v_owner_id::text || '/[^/]{1,255}$')
         or v_photo_path ~ '[?#]'
         or not exists (
           select 1
           from storage.objects o
           where o.bucket_id = 'product-photos'
             and o.name = v_photo_path
         )
      then
        raise exception 'PRODUCT_PHOTO_NOT_OWNED' using errcode = 'P0001';
      end if;
    end loop;
  end if;

  v_new_product_urls :=
    coalesce(v_business.product_photo_urls, '{}'::text[])
    || coalesce(p_new_product_photo_urls, '{}'::text[]);

  if pg_catalog.cardinality(coalesce(p_new_product_photo_urls, '{}'::text[])) > 0
     and pg_catalog.cardinality(v_new_product_urls) > 6
  then
    raise exception 'TOO_MANY_PRODUCT_PHOTOS' using errcode = 'P0001';
  end if;

  v_material_change :=
    v_business.business_name is distinct from v_business_name
    or v_business.owner_name is distinct from v_owner_name
    or v_business.phone is distinct from v_phone
    or v_business.instagram_username is distinct from v_instagram
    or v_business.category_id is distinct from p_category_id
    or v_business.description is distinct from v_description
    or (
      p_logo_url is not null
      and v_business.logo_url is distinct from p_logo_url
    )
    or (
      p_trade_license_url is not null
      and v_business.trade_license_url is distinct from p_trade_license_url
    )
    or pg_catalog.cardinality(
      coalesce(p_new_product_photo_urls, '{}'::text[])
    ) > 0;

  update public.businesses
  set business_name = v_business_name,
      owner_name = v_owner_name,
      -- email is intentionally immutable in this RPC.
      phone = v_phone,
      instagram_username = v_instagram,
      category_id = p_category_id,
      description = v_description,
      logo_url = coalesce(p_logo_url, logo_url),
      trade_license_url = coalesce(p_trade_license_url, trade_license_url),
      product_photo_urls = v_new_product_urls,
      approval_status = case
        when v_material_change and v_business.approval_status = 'approved'
          then 'pending_review'
        else v_business.approval_status
      end,
      requires_reapproval = case
        when v_material_change and v_business.approval_status = 'approved' then true
        else v_business.requires_reapproval
      end,
      submitted_at = case
        when v_material_change and v_business.approval_status = 'approved'
          then v_now
        else v_business.submitted_at
      end,
      reviewed_at = case
        when v_material_change and v_business.approval_status = 'approved'
          then null
        else v_business.reviewed_at
      end,
      reviewed_by = case
        when v_material_change and v_business.approval_status = 'approved'
          then null
        else v_business.reviewed_by
      end,
      rejection_reason = case
        when v_material_change
          and v_business.approval_status in ('approved', 'rejected')
          then null
        else v_business.rejection_reason
      end,
      last_profile_update = v_now,
      updated_at = v_now
  where id = v_business_id
  returning * into v_business;

  return v_business;
end;
$$;

-- =========================================================================
-- Event applications
-- =========================================================================

-- Registration status alone is not enough: scheduled opening/closing times,
-- archival, event end, and the current business review state are authoritative.
create or replace function public.apply_to_event(p_event_id uuid)
returns public.applications
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_business_id uuid;
  v_business public.businesses;
  v_event public.events;
  v_application public.applications;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_business_id := public.owned_business_id();
  if v_business_id is null then
    raise exception 'NO_BUSINESS' using errcode = 'P0001';
  end if;

  -- Serialize retries for the same business/event and protect the approval
  -- decision from a concurrent material profile update.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_business_id::text || ':' || p_event_id::text, 0)
  );

  select b.*
  into v_business
  from public.businesses b
  where b.id = v_business_id
  for share;

  if not found or v_business.approval_status <> 'approved' then
    raise exception 'BUSINESS_NOT_APPROVED' using errcode = 'P0001';
  end if;
  if v_business.requires_reapproval then
    raise exception 'BUSINESS_REAPPROVAL_REQUIRED' using errcode = 'P0001';
  end if;

  select e.*
  into v_event
  from public.events e
  where e.id = p_event_id
  for share;

  if not found
     or v_event.registration_status <> 'open'
     or v_event.is_archived
     or (v_event.registration_opens_at is not null and v_event.registration_opens_at > v_now)
     or (v_event.registration_closes_at is not null and v_event.registration_closes_at <= v_now)
     or (v_event.end_at is not null and v_event.end_at <= v_now)
  then
    raise exception 'EVENT_NOT_OPEN' using errcode = 'P0001';
  end if;

  select a.*
  into v_application
  from public.applications a
  where a.event_id = p_event_id
    and a.business_id = v_business_id
  for update;

  if found and v_application.status <> 'not_started' then
    raise exception 'ALREADY_APPLIED' using errcode = 'P0001';
  end if;

  if found then
    update public.applications
    set status = 'approved',
        submitted_at = v_now,
        reviewed_at = v_now,
        rejection_reason = null,
        updated_at = v_now
    where id = v_application.id
    returning * into v_application;
  else
    insert into public.applications (
      event_id, business_id, status, submitted_at, reviewed_at
    )
    values (
      p_event_id, v_business_id, 'approved', v_now, v_now
    )
    returning * into v_application;
  end if;

  return v_application;
end;
$$;

-- =========================================================================
-- Booth locking
-- =========================================================================

-- p_lock_minutes is retained for API compatibility but intentionally ignored.
-- The event's booth_lock_minutes is authoritative and is clamped to the same
-- range accepted by the admin event form.
create or replace function public.lock_booth(
  p_booth_id uuid,
  p_lock_minutes int default 5
)
returns public.booths
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_business_id uuid;
  v_event_id uuid;
  v_business public.businesses;
  v_event public.events;
  v_booth public.booths;
  v_application public.applications;
  v_invitation public.waiting_list;
  v_previous_application_id uuid;
  v_previous_business_id uuid;
  v_lock_minutes int;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_business_id := public.owned_business_id();
  if v_business_id is null then
    raise exception 'NO_BUSINESS' using errcode = 'P0001';
  end if;

  -- Read the event key before taking the per-business/event advisory lock.
  select b.event_id
  into v_event_id
  from public.booths b
  where b.id = p_booth_id;

  if not found then
    raise exception 'BOOTH_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Serializes concurrent booth requests for the same application even when
  -- they target different booth rows.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_business_id::text || ':' || v_event_id::text, 0)
  );

  select b.*
  into v_business
  from public.businesses b
  where b.id = v_business_id
  for share;

  if not found or v_business.approval_status <> 'approved' then
    raise exception 'BUSINESS_NOT_APPROVED' using errcode = 'P0001';
  end if;
  if v_business.requires_reapproval then
    raise exception 'BUSINESS_REAPPROVAL_REQUIRED' using errcode = 'P0001';
  end if;

  select e.*
  into v_event
  from public.events e
  where e.id = v_event_id
  for share;

  if not found
     or v_event.registration_status <> 'open'
     or v_event.is_archived
     or (v_event.registration_opens_at is not null and v_event.registration_opens_at > v_now)
     or (v_event.registration_closes_at is not null and v_event.registration_closes_at <= v_now)
     or (v_event.end_at is not null and v_event.end_at <= v_now)
  then
    raise exception 'EVENT_NOT_OPEN' using errcode = 'P0001';
  end if;

  v_lock_minutes := greatest(
    1,
    least(coalesce(v_event.booth_lock_minutes, 5), 120)
  );

  -- Lock the requested booth before its current holder's application. Every
  -- booth RPC in this migration follows that order, avoiding cross-user
  -- booth/application deadlocks.
  select b.*
  into v_booth
  from public.booths b
  where b.id = p_booth_id
  for update;

  if not found then
    raise exception 'BOOTH_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_booth.event_id <> v_event_id then
    raise exception 'BOOTH_EVENT_CHANGED' using errcode = 'P0001';
  end if;

  -- Reclaim an expired or malformed lock in this transaction. Only reset the
  -- previous application if it still points at this exact booth, so an old
  -- stale lock can never erase a newer selection.
  if v_booth.status = 'locked'
     and (v_booth.lock_expires_at is null or v_booth.lock_expires_at <= v_now)
  then
    v_previous_application_id := v_booth.current_application_id;
    v_previous_business_id := v_booth.locked_by_business_id;

    if v_previous_application_id is not null then
      update public.applications
      set booth_id = null,
          booth_price_before_vat = null,
          vat_amount = null,
          total_amount = null,
          status = 'approved',
          updated_at = v_now
      where id = v_previous_application_id
        and booth_id = p_booth_id
        and status = 'booth_selected';
    end if;

    update public.booths
    set status = 'available',
        held_for_business_id = null,
        locked_by_business_id = null,
        lock_expires_at = null,
        current_application_id = null,
        updated_at = v_now
    where id = p_booth_id
    returning * into v_booth;

    insert into public.booth_events (
      booth_id, event_type, business_id, details
    )
    values (
      p_booth_id,
      'expired',
      v_previous_business_id,
      pg_catalog.jsonb_build_object('auto', true, 'source', 'lock_booth')
    );
  end if;

  select a.*
  into v_application
  from public.applications a
  where a.event_id = v_event_id
    and a.business_id = v_business_id
  for update;

  if not found
     or v_application.status not in (
       'approved', 'booth_selection_available', 'booth_selected'
     )
  then
    raise exception 'APPLICATION_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;

  -- A booth_selected application may not silently abandon a different booth,
  -- even if that booth row is already inconsistent.
  if v_application.status = 'booth_selected'
     and v_application.booth_id is not null
     and v_application.booth_id <> p_booth_id
  then
    raise exception 'ACTIVE_BOOTH_EXISTS' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.booths active_booth
    where active_booth.event_id = v_event_id
      and active_booth.id <> p_booth_id
      and (
        active_booth.current_application_id = v_application.id
        or active_booth.locked_by_business_id = v_business_id
      )
      and (
        active_booth.status in ('awaiting_payment', 'reserved', 'confirmed')
        or (
          active_booth.status = 'locked'
          and active_booth.lock_expires_at is not null
          and active_booth.lock_expires_at > v_now
        )
      )
  ) then
    raise exception 'ACTIVE_BOOTH_EXISTS' using errcode = 'P0001';
  end if;

  -- Retrying the same valid lock is a read-only success. In particular it
  -- does not extend the expiry or append duplicate audit history.
  if v_booth.status = 'locked'
     and v_booth.locked_by_business_id = v_business_id
     and v_booth.current_application_id = v_application.id
     and v_booth.lock_expires_at is not null
     and v_booth.lock_expires_at > v_now
     and v_application.status = 'booth_selected'
     and v_application.booth_id = p_booth_id
  then
    return v_booth;
  end if;

  if v_booth.status = 'admin_held' then
    if v_booth.held_for_business_id is distinct from v_business_id then
      raise exception 'BOOTH_UNAVAILABLE' using errcode = 'P0001';
    end if;

    select w.*
    into v_invitation
    from public.waiting_list w
    where w.event_id = v_event_id
      and w.business_id = v_business_id
    for update;

    if not found
       or v_invitation.status <> 'invited'
       or v_invitation.invited_booth_id is distinct from p_booth_id
    then
      raise exception 'INVITATION_INVALID' using errcode = 'P0001';
    end if;
    if v_invitation.invitation_expires_at is null
       or v_invitation.invitation_expires_at <= v_now
    then
      raise exception 'INVITATION_EXPIRED' using errcode = 'P0001';
    end if;
  elsif v_booth.status <> 'available' then
    raise exception 'BOOTH_UNAVAILABLE' using errcode = 'P0001';
  end if;

  update public.booths
  set status = 'locked',
      locked_by_business_id = v_business_id,
      held_for_business_id = null,
      lock_expires_at = v_now + pg_catalog.make_interval(mins => v_lock_minutes),
      current_application_id = v_application.id,
      updated_at = v_now
  where id = p_booth_id
  returning * into v_booth;

  update public.applications
  set booth_id = p_booth_id,
      booth_price_before_vat = v_booth.price_before_vat,
      vat_amount = public.vat_amount(v_booth.price_before_vat),
      total_amount = v_booth.price_before_vat + public.vat_amount(v_booth.price_before_vat),
      status = 'booth_selected',
      updated_at = v_now
  where id = v_application.id;

  if v_invitation.id is not null then
    update public.waiting_list
    set status = 'accepted',
        updated_at = v_now
    where id = v_invitation.id
      and status = 'invited';
  end if;

  insert into public.booth_events (
    booth_id, event_type, business_id, actor_id, details
  )
  values (
    p_booth_id,
    'locked',
    v_business_id,
    auth.uid(),
    pg_catalog.jsonb_build_object(
      'lock_minutes', v_lock_minutes,
      'duration_source', 'event'
    )
  );

  return v_booth;
end;
$$;

-- Changing booths is only supported during the active lock phase. Once an
-- application reaches awaiting_payment, changing the booth would leave the
-- already-created payment amount stale and is therefore rejected.
create or replace function public.change_booth(
  p_old_booth_id uuid,
  p_new_booth_id uuid,
  p_lock_minutes int default 5
)
returns public.booths
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_business_id uuid;
  v_event_id uuid;
  v_business public.businesses;
  v_event public.events;
  v_old_booth public.booths;
  v_new_booth public.booths;
  v_application public.applications;
  v_previous_application_id uuid;
  v_previous_business_id uuid;
  v_locked_id uuid;
  v_locked_count int := 0;
  v_lock_minutes int;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if p_old_booth_id = p_new_booth_id then
    raise exception 'SAME_BOOTH' using errcode = 'P0001';
  end if;

  v_business_id := public.owned_business_id();
  if v_business_id is null then
    raise exception 'NO_BUSINESS' using errcode = 'P0001';
  end if;

  select b.event_id
  into v_event_id
  from public.booths b
  where b.id = p_old_booth_id;

  if not found then
    raise exception 'BOOTH_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_business_id::text || ':' || v_event_id::text, 0)
  );

  -- Lock both booth rows in UUID order so malicious cross-swap requests
  -- cannot deadlock one another.
  for v_locked_id in
    select b.id
    from public.booths b
    where b.id in (p_old_booth_id, p_new_booth_id)
    order by b.id
    for update
  loop
    v_locked_count := v_locked_count + 1;
  end loop;

  if v_locked_count <> 2 then
    raise exception 'BOOTH_NOT_FOUND' using errcode = 'P0001';
  end if;

  select b.* into v_old_booth
  from public.booths b
  where b.id = p_old_booth_id;

  select b.* into v_new_booth
  from public.booths b
  where b.id = p_new_booth_id;

  if v_old_booth.event_id <> v_new_booth.event_id
     or v_old_booth.event_id <> v_event_id
  then
    raise exception 'BOOTH_EVENT_MISMATCH' using errcode = 'P0001';
  end if;

  select b.*
  into v_business
  from public.businesses b
  where b.id = v_business_id
  for share;

  if not found or v_business.approval_status <> 'approved' then
    raise exception 'BUSINESS_NOT_APPROVED' using errcode = 'P0001';
  end if;
  if v_business.requires_reapproval then
    raise exception 'BUSINESS_REAPPROVAL_REQUIRED' using errcode = 'P0001';
  end if;

  select e.*
  into v_event
  from public.events e
  where e.id = v_event_id
  for share;

  if not found
     or v_event.registration_status <> 'open'
     or v_event.is_archived
     or (v_event.registration_opens_at is not null and v_event.registration_opens_at > v_now)
     or (v_event.registration_closes_at is not null and v_event.registration_closes_at <= v_now)
     or (v_event.end_at is not null and v_event.end_at <= v_now)
  then
    raise exception 'EVENT_NOT_OPEN' using errcode = 'P0001';
  end if;
  if v_event.booth_changes_locked then
    raise exception 'CHANGES_LOCKED' using errcode = 'P0001';
  end if;

  if v_old_booth.status <> 'locked' then
    raise exception 'BOOTH_NOT_CHANGEABLE' using errcode = 'P0001';
  end if;
  if v_old_booth.locked_by_business_id is distinct from v_business_id
     or v_old_booth.lock_expires_at is null
     or v_old_booth.lock_expires_at <= v_now
  then
    raise exception 'LOCK_EXPIRED_OR_INVALID' using errcode = 'P0001';
  end if;

  select a.*
  into v_application
  from public.applications a
  where a.id = v_old_booth.current_application_id
    and a.event_id = v_event_id
    and a.business_id = v_business_id
  for update;

  if not found
     or v_application.status <> 'booth_selected'
     or v_application.booth_id is distinct from p_old_booth_id
  then
    raise exception 'APPLICATION_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.booths active_booth
    where active_booth.event_id = v_event_id
      and active_booth.id not in (p_old_booth_id, p_new_booth_id)
      and (
        active_booth.current_application_id = v_application.id
        or active_booth.locked_by_business_id = v_business_id
      )
      and (
        active_booth.status in ('awaiting_payment', 'reserved', 'confirmed')
        or (
          active_booth.status = 'locked'
          and active_booth.lock_expires_at is not null
          and active_booth.lock_expires_at > v_now
        )
      )
  ) then
    raise exception 'ACTIVE_BOOTH_EXISTS' using errcode = 'P0001';
  end if;

  -- Reclaim an expired holder of the target without touching a previous
  -- application's newer booth selection.
  if v_new_booth.status = 'locked'
     and (v_new_booth.lock_expires_at is null or v_new_booth.lock_expires_at <= v_now)
  then
    v_previous_application_id := v_new_booth.current_application_id;
    v_previous_business_id := v_new_booth.locked_by_business_id;

    if v_previous_application_id is not null then
      update public.applications
      set booth_id = null,
          booth_price_before_vat = null,
          vat_amount = null,
          total_amount = null,
          status = 'approved',
          updated_at = v_now
      where id = v_previous_application_id
        and booth_id = p_new_booth_id
        and status = 'booth_selected';
    end if;

    update public.booths
    set status = 'available',
        held_for_business_id = null,
        locked_by_business_id = null,
        lock_expires_at = null,
        current_application_id = null,
        updated_at = v_now
    where id = p_new_booth_id
    returning * into v_new_booth;

    insert into public.booth_events (
      booth_id, event_type, business_id, details
    )
    values (
      p_new_booth_id,
      'expired',
      v_previous_business_id,
      pg_catalog.jsonb_build_object('auto', true, 'source', 'change_booth')
    );
  end if;

  if v_new_booth.status <> 'available' then
    raise exception 'BOOTH_UNAVAILABLE' using errcode = 'P0001';
  end if;

  v_lock_minutes := greatest(
    1,
    least(coalesce(v_event.booth_lock_minutes, 5), 120)
  );

  -- Releasing first is transaction-safe: any later error rolls the entire RPC
  -- back, restoring the old lock.
  update public.booths
  set status = 'available',
      held_for_business_id = null,
      locked_by_business_id = null,
      lock_expires_at = null,
      current_application_id = null,
      updated_at = v_now
  where id = p_old_booth_id;

  update public.booths
  set status = 'locked',
      held_for_business_id = null,
      locked_by_business_id = v_business_id,
      lock_expires_at = v_now + pg_catalog.make_interval(mins => v_lock_minutes),
      current_application_id = v_application.id,
      updated_at = v_now
  where id = p_new_booth_id
  returning * into v_new_booth;

  update public.applications
  set booth_id = p_new_booth_id,
      booth_price_before_vat = v_new_booth.price_before_vat,
      vat_amount = public.vat_amount(v_new_booth.price_before_vat),
      total_amount = v_new_booth.price_before_vat + public.vat_amount(v_new_booth.price_before_vat),
      status = 'booth_selected',
      updated_at = v_now
  where id = v_application.id;

  insert into public.booth_change_log (
    application_id, old_booth_id, new_booth_id,
    old_price, new_price, changed_by, reason
  )
  values (
    v_application.id, p_old_booth_id, p_new_booth_id,
    v_old_booth.price_before_vat, v_new_booth.price_before_vat,
    auth.uid(), 'vendor_change'
  );

  insert into public.booth_events (
    booth_id, event_type, business_id, actor_id, details
  )
  values (
    p_new_booth_id,
    'swapped',
    v_business_id,
    auth.uid(),
    pg_catalog.jsonb_build_object(
      'from_booth', p_old_booth_id,
      'lock_minutes', v_lock_minutes,
      'duration_source', 'event'
    )
  );

  insert into public.booth_events (
    booth_id, event_type, business_id, actor_id, details
  )
  values (
    p_old_booth_id,
    'released',
    v_business_id,
    auth.uid(),
    pg_catalog.jsonb_build_object(
      'reason', 'changed_to',
      'to_booth', p_new_booth_id
    )
  );

  return v_new_booth;
end;
$$;

-- Confirm the lock and create/reopen its payment as one transaction. This
-- additionally prevents a stale/corrupt booth pointer from changing another
-- business's application or reopening a terminal payment.
create or replace function public.confirm_booth_selection(p_booth_id uuid)
returns public.booths
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_business_id uuid;
  v_business public.businesses;
  v_event_id uuid;
  v_booth public.booths;
  v_event public.events;
  v_application public.applications;
  v_payment public.payments;
  v_payment_minutes int;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_business_id := public.owned_business_id();
  if v_business_id is null then
    raise exception 'NO_BUSINESS' using errcode = 'P0001';
  end if;

  select b.*
  into v_business
  from public.businesses b
  where b.id = v_business_id
  for share;

  if not found or v_business.approval_status <> 'approved' then
    raise exception 'BUSINESS_NOT_APPROVED' using errcode = 'P0001';
  end if;
  if v_business.requires_reapproval then
    raise exception 'BUSINESS_REAPPROVAL_REQUIRED' using errcode = 'P0001';
  end if;

  select b.event_id
  into v_event_id
  from public.booths b
  where b.id = p_booth_id;

  if not found then
    raise exception 'BOOTH_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_business_id::text || ':' || v_event_id::text, 0)
  );

  select b.*
  into v_booth
  from public.booths b
  where b.id = p_booth_id
  for update;

  if not found
     or v_booth.event_id <> v_event_id
     or v_booth.status <> 'locked'
     or v_booth.locked_by_business_id is distinct from v_business_id
     or v_booth.lock_expires_at is null
     or v_booth.lock_expires_at <= v_now
  then
    raise exception 'LOCK_EXPIRED_OR_INVALID' using errcode = 'P0001';
  end if;

  select a.*
  into v_application
  from public.applications a
  where a.id = v_booth.current_application_id
    and a.event_id = v_event_id
    and a.business_id = v_business_id
  for update;

  if not found
     or v_application.status <> 'booth_selected'
     or v_application.booth_id is distinct from p_booth_id
  then
    raise exception 'APPLICATION_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;

  select e.*
  into v_event
  from public.events e
  where e.id = v_event_id
  for share;

  if not found
     or v_event.is_archived
     or (v_event.end_at is not null and v_event.end_at <= v_now)
  then
    raise exception 'EVENT_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  v_payment_minutes := greatest(
    5,
    least(coalesce(v_event.payment_deadline_minutes, 60), 10080)
  );

  select p.*
  into v_payment
  from public.payments p
  where p.application_id = v_application.id
  for update;

  if found and v_payment.status in (
    'pending_verification', 'paid', 'refunded', 'partially_refunded'
  ) then
    raise exception 'PAYMENT_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  update public.booths
  set status = 'awaiting_payment',
      lock_expires_at = null,
      updated_at = v_now
  where id = p_booth_id
  returning * into v_booth;

  update public.applications
  set status = 'awaiting_payment',
      updated_at = v_now
  where id = v_application.id;

  if v_payment.id is null then
    insert into public.payments (
      application_id, status, amount, deadline_at
    )
    values (
      v_application.id,
      'payment_required',
      v_application.total_amount,
      v_now + pg_catalog.make_interval(mins => v_payment_minutes)
    );
  else
    update public.payments
    set method = null,
        status = 'payment_required',
        amount = v_application.total_amount,
        payment_reference = null,
        receipt_url = null,
        transfer_reference = null,
        transfer_date = null,
        deadline_at = v_now + pg_catalog.make_interval(mins => v_payment_minutes),
        rejection_reason = null,
        verified_by = null,
        verified_at = null,
        updated_at = v_now
    where id = v_payment.id;
  end if;

  insert into public.booth_events (
    booth_id, event_type, business_id, actor_id, details
  )
  values (
    p_booth_id,
    'awaiting_payment',
    v_business_id,
    auth.uid(),
    pg_catalog.jsonb_build_object(
      'payment_deadline_minutes', v_payment_minutes,
      'duration_source', 'event'
    )
  );

  return v_booth;
end;
$$;

-- A stale lock sweep must only reset an application that still points at the
-- stale booth; otherwise a delayed sweep could erase a newer valid selection.
create or replace function public.release_expired_booth_locks(
  p_event_id uuid default null
)
returns int
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_count int := 0;
  v_booth record;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  for v_booth in
    select b.id, b.current_application_id, b.locked_by_business_id
    from public.booths b
    where b.status = 'locked'
      and (b.lock_expires_at is null or b.lock_expires_at <= v_now)
      and (p_event_id is null or b.event_id = p_event_id)
    order by b.id
    for update skip locked
  loop
    if v_booth.current_application_id is not null then
      update public.applications
      set booth_id = null,
          booth_price_before_vat = null,
          vat_amount = null,
          total_amount = null,
          status = 'approved',
          updated_at = v_now
      where id = v_booth.current_application_id
        and booth_id = v_booth.id
        and status = 'booth_selected';
    end if;

    update public.booths
    set status = 'available',
        held_for_business_id = null,
        locked_by_business_id = null,
        lock_expires_at = null,
        current_application_id = null,
        updated_at = v_now
    where id = v_booth.id;

    insert into public.booth_events (
      booth_id, event_type, business_id, details
    )
    values (
      v_booth.id,
      'expired',
      v_booth.locked_by_business_id,
      pg_catalog.jsonb_build_object('auto', true, 'source', 'sweep')
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- =========================================================================
-- Payment submissions
-- =========================================================================

create or replace function public.submit_adcb_payment_reference(
  p_payment_id uuid,
  p_reference text
)
returns public.payments
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_business_id uuid;
  v_business public.businesses;
  v_payment public.payments;
  v_application public.applications;
  v_reference text := pg_catalog.btrim(p_reference);
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_business_id := public.owned_business_id();
  if v_business_id is null then
    raise exception 'NO_BUSINESS' using errcode = 'P0001';
  end if;

  select b.*
  into v_business
  from public.businesses b
  where b.id = v_business_id
  for share;

  if not found or v_business.approval_status <> 'approved' then
    raise exception 'BUSINESS_NOT_APPROVED' using errcode = 'P0001';
  end if;
  if v_business.requires_reapproval then
    raise exception 'BUSINESS_REAPPROVAL_REQUIRED' using errcode = 'P0001';
  end if;

  if v_reference is null
     or pg_catalog.char_length(v_reference) not between 2 and 120
     or v_reference ~ '[[:cntrl:]]'
  then
    raise exception 'INVALID_PAYMENT_REFERENCE' using errcode = 'P0001';
  end if;

  select p.*
  into v_payment
  from public.payments p
  where p.id = p_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_EDITABLE' using errcode = 'P0001';
  end if;

  select a.*
  into v_application
  from public.applications a
  where a.id = v_payment.application_id
  for update;

  if not found
     or v_application.business_id <> v_business_id
     or v_application.status not in ('awaiting_payment', 'payment_under_review')
     or v_application.booth_id is null
     or v_payment.status not in ('payment_required', 'pending_payment')
  then
    raise exception 'PAYMENT_NOT_EDITABLE' using errcode = 'P0001';
  end if;

  if v_payment.deadline_at is null or v_payment.deadline_at <= v_now then
    raise exception 'PAYMENT_DEADLINE_EXPIRED' using errcode = 'P0001';
  end if;

  perform 1
  from public.booths b
  where b.id = v_application.booth_id
    and b.current_application_id = v_application.id
    and b.locked_by_business_id = v_business_id
    and b.status = 'awaiting_payment'
  for update;

  if not found then
    raise exception 'PAYMENT_BOOTH_INVALID' using errcode = 'P0001';
  end if;

  update public.payments
  set method = 'adcb_pace_pay',
      status = 'pending_verification',
      payment_reference = v_reference,
      receipt_url = null,
      transfer_reference = null,
      transfer_date = null,
      rejection_reason = null,
      updated_at = v_now
  where id = p_payment_id
  returning * into v_payment;

  update public.applications
  set status = 'payment_under_review',
      updated_at = v_now
  where id = v_application.id;

  return v_payment;
end;
$$;

create or replace function public.submit_bank_transfer_receipt(
  p_payment_id uuid,
  p_receipt_path text,
  p_transfer_reference text,
  p_transfer_date date
)
returns public.payments
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_business_id uuid;
  v_business public.businesses;
  v_owner_id uuid := auth.uid();
  v_payment public.payments;
  v_application public.applications;
  v_receipt_path text := pg_catalog.btrim(p_receipt_path);
  v_transfer_reference text := pg_catalog.btrim(p_transfer_reference);
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_business_id := public.owned_business_id();
  if v_business_id is null or v_owner_id is null then
    raise exception 'NO_BUSINESS' using errcode = 'P0001';
  end if;

  select b.*
  into v_business
  from public.businesses b
  where b.id = v_business_id
  for share;

  if not found or v_business.approval_status <> 'approved' then
    raise exception 'BUSINESS_NOT_APPROVED' using errcode = 'P0001';
  end if;
  if v_business.requires_reapproval then
    raise exception 'BUSINESS_REAPPROVAL_REQUIRED' using errcode = 'P0001';
  end if;

  if v_transfer_reference is null
     or pg_catalog.char_length(v_transfer_reference) not between 2 and 120
     or v_transfer_reference ~ '[[:cntrl:]]'
  then
    raise exception 'INVALID_TRANSFER_REFERENCE' using errcode = 'P0001';
  end if;

  if p_transfer_date is null
     or p_transfer_date > current_date
     or p_transfer_date < current_date - 365
  then
    raise exception 'INVALID_TRANSFER_DATE' using errcode = 'P0001';
  end if;

  if v_receipt_path is null
     or pg_catalog.char_length(v_receipt_path) not between 38 and 512
     or v_receipt_path !~ ('^' || v_owner_id::text || '/[^/]{1,255}$')
     or v_receipt_path ~ '(^|/)\.\.?(/|$)'
     or v_receipt_path ~ '[[:cntrl:]]'
     or pg_catalog.strpos(v_receipt_path, pg_catalog.chr(92)) > 0
  then
    raise exception 'RECEIPT_NOT_OWNED' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'payment-receipts'
      and o.name = v_receipt_path
  ) then
    raise exception 'RECEIPT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select p.*
  into v_payment
  from public.payments p
  where p.id = p_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_EDITABLE' using errcode = 'P0001';
  end if;

  select a.*
  into v_application
  from public.applications a
  where a.id = v_payment.application_id
  for update;

  if not found
     or v_application.business_id <> v_business_id
     or v_application.status not in ('awaiting_payment', 'payment_under_review')
     or v_application.booth_id is null
     or v_payment.status not in (
       'payment_required', 'pending_payment', 'receipt_uploaded'
     )
  then
    raise exception 'PAYMENT_NOT_EDITABLE' using errcode = 'P0001';
  end if;

  if v_payment.deadline_at is null or v_payment.deadline_at <= v_now then
    raise exception 'PAYMENT_DEADLINE_EXPIRED' using errcode = 'P0001';
  end if;

  perform 1
  from public.booths b
  where b.id = v_application.booth_id
    and b.current_application_id = v_application.id
    and b.locked_by_business_id = v_business_id
    and b.status = 'awaiting_payment'
  for update;

  if not found then
    raise exception 'PAYMENT_BOOTH_INVALID' using errcode = 'P0001';
  end if;

  update public.payments
  set method = 'bank_transfer',
      status = 'pending_verification',
      payment_reference = null,
      receipt_url = v_receipt_path,
      transfer_reference = v_transfer_reference,
      transfer_date = p_transfer_date,
      rejection_reason = null,
      updated_at = v_now
  where id = p_payment_id
  returning * into v_payment;

  update public.applications
  set status = 'payment_under_review',
      updated_at = v_now
  where id = v_application.id;

  return v_payment;
end;
$$;

-- Only untouched payment requests expire. A submitted ADCB reference and a
-- submitted bank receipt both move to pending_verification, so an administrator
-- can review them without a deadline sweep releasing the booth underneath them.
-- Keep expiry compatible with the awaiting-payment application state,
-- and serialize each payment before releasing its booth.
create or replace function public.expire_overdue_payments(
  p_event_id uuid default null
)
returns int
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_count int := 0;
  v_payment record;
  v_application public.applications;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  for v_payment in
    select p.id, p.application_id
    from public.payments p
    join public.applications a on a.id = p.application_id
    where p.status in ('payment_required', 'pending_payment')
      and p.deadline_at is not null
      and p.deadline_at <= v_now
      and (p_event_id is null or a.event_id = p_event_id)
    order by p.id
    for update of p skip locked
  loop
    select a.*
    into v_application
    from public.applications a
    where a.id = v_payment.application_id
    for update;

    update public.payments
    set status = 'expired',
        updated_at = v_now
    where id = v_payment.id;

    if found
       and v_application.status in ('awaiting_payment', 'payment_under_review')
       and v_application.booth_id is not null
    then
      update public.booths
      set status = 'available',
          held_for_business_id = null,
          locked_by_business_id = null,
          lock_expires_at = null,
          current_application_id = null,
          updated_at = v_now
      where id = v_application.booth_id
        and current_application_id = v_application.id
        and status = 'awaiting_payment';

      if found then
        insert into public.booth_events (
          booth_id, event_type, business_id, details
        )
        values (
          v_application.booth_id,
          'expired',
          v_application.business_id,
          pg_catalog.jsonb_build_object('reason', 'payment_expired')
        );
      end if;

      update public.applications
      set booth_id = null,
          booth_price_before_vat = null,
          vat_amount = null,
          total_amount = null,
          status = 'approved',
          updated_at = v_now
      where id = v_application.id
        and status in ('awaiting_payment', 'payment_under_review');
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- =========================================================================
-- Atomic admin payment transitions
-- =========================================================================

-- Every admin payment mutation re-checks the authenticated profile inside the
-- SECURITY DEFINER boundary, derives actor/time from the database session, and
-- serializes with the vendor booth flow on the same business/event advisory
-- lock. Payment, application, and booth rows are then locked in that order,
-- matching the payment-submission and expiry functions above.
create or replace function public.admin_confirm_payment(
  p_payment_id uuid,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  v_application_id uuid;
  v_business_id uuid;
  v_actual_event_id uuid;
  v_event public.events;
  v_payment public.payments;
  v_application public.applications;
  v_booth public.booths;
  v_previous_status text;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_payment_id is null or p_event_id is null then
    raise exception 'INVALID_PAYMENT_REQUEST' using errcode = 'P0001';
  end if;

  select p.application_id, a.business_id, a.event_id
  into v_application_id, v_business_id, v_actual_event_id
  from public.payments p
  join public.applications a on a.id = p.application_id
  where p.id = p_payment_id;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_business_id::text || ':' || v_actual_event_id::text,
      0
    )
  );

  select e.*
  into v_event
  from public.events e
  where e.id = v_actual_event_id
  for share;

  if not found or v_actual_event_id <> p_event_id then
    raise exception 'PAYMENT_EVENT_MISMATCH' using errcode = 'P0001';
  end if;

  select p.*
  into v_payment
  from public.payments p
  where p.id = p_payment_id
  for update;

  if not found or v_payment.application_id <> v_application_id then
    raise exception 'PAYMENT_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  select a.*
  into v_application
  from public.applications a
  where a.id = v_application_id
  for update;

  if not found
     or v_application.event_id <> p_event_id
     or v_application.business_id <> v_business_id
  then
    raise exception 'PAYMENT_EVENT_MISMATCH' using errcode = 'P0001';
  end if;
  if v_payment.status not in ('pending_payment', 'pending_verification') then
    raise exception 'PAYMENT_STATE_CONFLICT' using errcode = 'P0001';
  end if;
  if v_application.status not in ('awaiting_payment', 'payment_under_review')
     or v_application.booth_id is null
  then
    raise exception 'APPLICATION_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  select b.*
  into v_booth
  from public.booths b
  where b.id = v_application.booth_id
  for update;

  if not found
     or v_booth.event_id <> p_event_id
     or v_booth.status <> 'awaiting_payment'
     or v_booth.current_application_id is distinct from v_application.id
     or v_booth.locked_by_business_id is distinct from v_application.business_id
  then
    raise exception 'PAYMENT_BOOTH_INVALID' using errcode = 'P0001';
  end if;
  if v_application.total_amount is null
     or v_application.total_amount <= 0
     or v_payment.amount is distinct from v_application.total_amount
  then
    raise exception 'PAYMENT_AMOUNT_MISMATCH' using errcode = 'P0001';
  end if;

  v_previous_status := v_payment.status;

  update public.payments
  set status = 'paid',
      verified_by = v_actor_id,
      verified_at = v_now,
      rejection_reason = null,
      refund_amount = null,
      updated_at = v_now
  where id = v_payment.id
  returning * into v_payment;

  update public.applications
  set status = 'confirmed',
      confirmed_at = v_now,
      updated_at = v_now
  where id = v_application.id;

  update public.booths
  set status = 'confirmed',
      lock_expires_at = null,
      updated_at = v_now
  where id = v_booth.id;

  insert into public.booth_events (
    booth_id, event_type, business_id, actor_id, details
  )
  values (
    v_booth.id,
    'confirmed',
    v_application.business_id,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'payment_id', v_payment.id,
      'source', 'admin_payment_confirmation'
    )
  );

  return pg_catalog.jsonb_build_object(
    'payment_id', v_payment.id,
    'application_id', v_application.id,
    'business_id', v_application.business_id,
    'booth_id', v_booth.id,
    'event_id', v_application.event_id,
    'previous_status', v_previous_status,
    'status', v_payment.status,
    'amount', v_payment.amount,
    'refund_amount', v_payment.refund_amount,
    'full_refund', null,
    'deadline_at', v_payment.deadline_at
  );
end;
$$;

create or replace function public.admin_reject_payment(
  p_payment_id uuid,
  p_event_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  v_application_id uuid;
  v_business_id uuid;
  v_actual_event_id uuid;
  v_event public.events;
  v_payment public.payments;
  v_application public.applications;
  v_booth public.booths;
  v_reason text := pg_catalog.btrim(p_reason);
  v_previous_status text;
  v_deadline_minutes int;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_payment_id is null or p_event_id is null then
    raise exception 'INVALID_PAYMENT_REQUEST' using errcode = 'P0001';
  end if;
  if v_reason is null
     or pg_catalog.char_length(v_reason) = 0
     or pg_catalog.char_length(v_reason) > 2000
  then
    raise exception 'INVALID_REJECTION_REASON' using errcode = 'P0001';
  end if;

  select p.application_id, a.business_id, a.event_id
  into v_application_id, v_business_id, v_actual_event_id
  from public.payments p
  join public.applications a on a.id = p.application_id
  where p.id = p_payment_id;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_business_id::text || ':' || v_actual_event_id::text,
      0
    )
  );

  select e.*
  into v_event
  from public.events e
  where e.id = v_actual_event_id
  for share;

  if not found or v_actual_event_id <> p_event_id then
    raise exception 'PAYMENT_EVENT_MISMATCH' using errcode = 'P0001';
  end if;

  select p.*
  into v_payment
  from public.payments p
  where p.id = p_payment_id
  for update;

  if not found or v_payment.application_id <> v_application_id then
    raise exception 'PAYMENT_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  select a.*
  into v_application
  from public.applications a
  where a.id = v_application_id
  for update;

  if not found
     or v_application.event_id <> p_event_id
     or v_application.business_id <> v_business_id
  then
    raise exception 'PAYMENT_EVENT_MISMATCH' using errcode = 'P0001';
  end if;
  if v_payment.status not in ('pending_payment', 'pending_verification') then
    raise exception 'PAYMENT_STATE_CONFLICT' using errcode = 'P0001';
  end if;
  if v_application.status not in ('awaiting_payment', 'payment_under_review')
     or v_application.booth_id is null
  then
    raise exception 'APPLICATION_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  select b.*
  into v_booth
  from public.booths b
  where b.id = v_application.booth_id
  for update;

  if not found
     or v_booth.event_id <> p_event_id
     or v_booth.status <> 'awaiting_payment'
     or v_booth.current_application_id is distinct from v_application.id
     or v_booth.locked_by_business_id is distinct from v_application.business_id
  then
    raise exception 'PAYMENT_BOOTH_INVALID' using errcode = 'P0001';
  end if;

  v_previous_status := v_payment.status;
  v_deadline_minutes := greatest(
    5,
    least(coalesce(v_event.payment_deadline_minutes, 60), 10080)
  );

  update public.applications
  set status = 'awaiting_payment',
      confirmed_at = null,
      updated_at = v_now
  where id = v_application.id;

  update public.payments
  set status = 'payment_required',
      rejection_reason = v_reason,
      deadline_at = v_now + pg_catalog.make_interval(mins => v_deadline_minutes),
      verified_by = null,
      verified_at = null,
      updated_at = v_now
  where id = v_payment.id
  returning * into v_payment;

  return pg_catalog.jsonb_build_object(
    'payment_id', v_payment.id,
    'application_id', v_application.id,
    'business_id', v_application.business_id,
    'booth_id', v_booth.id,
    'event_id', v_application.event_id,
    'previous_status', v_previous_status,
    'status', v_payment.status,
    'amount', v_payment.amount,
    'refund_amount', v_payment.refund_amount,
    'full_refund', null,
    'deadline_at', v_payment.deadline_at
  );
end;
$$;

create or replace function public.admin_extend_payment_deadline(
  p_payment_id uuid,
  p_event_id uuid,
  p_extra_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  v_application_id uuid;
  v_business_id uuid;
  v_actual_event_id uuid;
  v_payment public.payments;
  v_application public.applications;
  v_booth public.booths;
  v_previous_status text;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_payment_id is null or p_event_id is null
     or p_extra_minutes is null
     or p_extra_minutes not between 1 and 10080
  then
    raise exception 'INVALID_DEADLINE_MINUTES' using errcode = 'P0001';
  end if;

  select p.application_id, a.business_id, a.event_id
  into v_application_id, v_business_id, v_actual_event_id
  from public.payments p
  join public.applications a on a.id = p.application_id
  where p.id = p_payment_id;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_business_id::text || ':' || v_actual_event_id::text,
      0
    )
  );

  perform 1
  from public.events e
  where e.id = v_actual_event_id
  for share;

  if not found or v_actual_event_id <> p_event_id then
    raise exception 'PAYMENT_EVENT_MISMATCH' using errcode = 'P0001';
  end if;

  select p.*
  into v_payment
  from public.payments p
  where p.id = p_payment_id
  for update;

  if not found or v_payment.application_id <> v_application_id then
    raise exception 'PAYMENT_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  select a.*
  into v_application
  from public.applications a
  where a.id = v_application_id
  for update;

  if not found
     or v_application.event_id <> p_event_id
     or v_application.business_id <> v_business_id
  then
    raise exception 'PAYMENT_EVENT_MISMATCH' using errcode = 'P0001';
  end if;
  if v_payment.status not in ('payment_required', 'pending_payment') then
    raise exception 'PAYMENT_STATE_CONFLICT' using errcode = 'P0001';
  end if;
  if v_application.status <> 'awaiting_payment'
     or v_application.booth_id is null
  then
    raise exception 'APPLICATION_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  select b.*
  into v_booth
  from public.booths b
  where b.id = v_application.booth_id
  for update;

  if not found
     or v_booth.event_id <> p_event_id
     or v_booth.status <> 'awaiting_payment'
     or v_booth.current_application_id is distinct from v_application.id
     or v_booth.locked_by_business_id is distinct from v_application.business_id
  then
    raise exception 'PAYMENT_BOOTH_INVALID' using errcode = 'P0001';
  end if;

  v_previous_status := v_payment.status;

  update public.payments
  set deadline_at = greatest(coalesce(v_payment.deadline_at, v_now), v_now)
                    + pg_catalog.make_interval(mins => p_extra_minutes),
      updated_at = v_now
  where id = v_payment.id
  returning * into v_payment;

  return pg_catalog.jsonb_build_object(
    'payment_id', v_payment.id,
    'application_id', v_application.id,
    'business_id', v_application.business_id,
    'booth_id', v_booth.id,
    'event_id', v_application.event_id,
    'previous_status', v_previous_status,
    'status', v_payment.status,
    'amount', v_payment.amount,
    'refund_amount', v_payment.refund_amount,
    'full_refund', null,
    'deadline_at', v_payment.deadline_at
  );
end;
$$;

create or replace function public.admin_reopen_payment(
  p_payment_id uuid,
  p_event_id uuid,
  p_deadline_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  v_application_id uuid;
  v_business_id uuid;
  v_actual_event_id uuid;
  v_payment public.payments;
  v_application public.applications;
  v_booth public.booths;
  v_previous_status text;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_payment_id is null or p_event_id is null
     or p_deadline_minutes is null
     or p_deadline_minutes not between 5 and 10080
  then
    raise exception 'INVALID_DEADLINE_MINUTES' using errcode = 'P0001';
  end if;

  select p.application_id, a.business_id, a.event_id
  into v_application_id, v_business_id, v_actual_event_id
  from public.payments p
  join public.applications a on a.id = p.application_id
  where p.id = p_payment_id;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_business_id::text || ':' || v_actual_event_id::text,
      0
    )
  );

  perform 1
  from public.events e
  where e.id = v_actual_event_id
  for share;

  if not found or v_actual_event_id <> p_event_id then
    raise exception 'PAYMENT_EVENT_MISMATCH' using errcode = 'P0001';
  end if;

  select p.*
  into v_payment
  from public.payments p
  where p.id = p_payment_id
  for update;

  if not found or v_payment.application_id <> v_application_id then
    raise exception 'PAYMENT_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  select a.*
  into v_application
  from public.applications a
  where a.id = v_application_id
  for update;

  if not found
     or v_application.event_id <> p_event_id
     or v_application.business_id <> v_business_id
  then
    raise exception 'PAYMENT_EVENT_MISMATCH' using errcode = 'P0001';
  end if;
  if v_payment.status <> 'expired' then
    raise exception 'PAYMENT_STATE_CONFLICT' using errcode = 'P0001';
  end if;
  if v_application.status not in (
       'booth_selected', 'awaiting_payment', 'payment_under_review'
     )
     or v_application.booth_id is null
  then
    raise exception 'APPLICATION_STATE_CONFLICT' using errcode = 'P0001';
  end if;
  if v_application.total_amount is null or v_application.total_amount <= 0 then
    raise exception 'PAYMENT_AMOUNT_MISMATCH' using errcode = 'P0001';
  end if;

  select b.*
  into v_booth
  from public.booths b
  where b.id = v_application.booth_id
  for update;

  if not found
     or v_booth.event_id <> p_event_id
     or v_booth.status not in ('locked', 'reserved', 'awaiting_payment')
     or v_booth.current_application_id is distinct from v_application.id
     or v_booth.locked_by_business_id is distinct from v_application.business_id
  then
    raise exception 'PAYMENT_BOOTH_INVALID' using errcode = 'P0001';
  end if;
  if v_booth.status = 'locked'
     and (
       v_booth.lock_expires_at is null
       or v_booth.lock_expires_at <= v_now
     )
  then
    raise exception 'BOOTH_LOCK_EXPIRED' using errcode = 'P0001';
  end if;

  v_previous_status := v_payment.status;

  update public.payments
  set status = 'payment_required',
      amount = v_application.total_amount,
      deadline_at = v_now + pg_catalog.make_interval(mins => p_deadline_minutes),
      verified_by = null,
      verified_at = null,
      rejection_reason = null,
      refund_amount = null,
      updated_at = v_now
  where id = v_payment.id
  returning * into v_payment;

  update public.applications
  set status = 'awaiting_payment',
      confirmed_at = null,
      updated_at = v_now
  where id = v_application.id;

  update public.booths
  set status = 'awaiting_payment',
      held_for_business_id = null,
      lock_expires_at = null,
      updated_at = v_now
  where id = v_booth.id;

  insert into public.booth_events (
    booth_id, event_type, business_id, actor_id, details
  )
  values (
    v_booth.id,
    'awaiting_payment',
    v_application.business_id,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'payment_id', v_payment.id,
      'source', 'admin_payment_reopen'
    )
  );

  return pg_catalog.jsonb_build_object(
    'payment_id', v_payment.id,
    'application_id', v_application.id,
    'business_id', v_application.business_id,
    'booth_id', v_booth.id,
    'event_id', v_application.event_id,
    'previous_status', v_previous_status,
    'status', v_payment.status,
    'amount', v_payment.amount,
    'refund_amount', v_payment.refund_amount,
    'full_refund', null,
    'deadline_at', v_payment.deadline_at
  );
end;
$$;

create or replace function public.admin_refund_payment(
  p_payment_id uuid,
  p_event_id uuid,
  p_refund_amount numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  v_application_id uuid;
  v_business_id uuid;
  v_actual_event_id uuid;
  v_event public.events;
  v_payment public.payments;
  v_application public.applications;
  v_notes text := nullif(pg_catalog.btrim(p_notes), '');
  v_previous_status text;
  v_full_refund boolean;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_payment_id is null or p_event_id is null then
    raise exception 'INVALID_PAYMENT_REQUEST' using errcode = 'P0001';
  end if;
  if p_refund_amount is null
     or p_refund_amount::text = 'NaN'
     or p_refund_amount <> round(p_refund_amount, 2)
     or p_refund_amount <= 0
     or p_refund_amount > 99999999.99
  then
    raise exception 'INVALID_REFUND_AMOUNT' using errcode = 'P0001';
  end if;
  if v_notes is not null and pg_catalog.char_length(v_notes) > 5000 then
    raise exception 'INVALID_PAYMENT_NOTES' using errcode = 'P0001';
  end if;

  select p.application_id, a.business_id, a.event_id
  into v_application_id, v_business_id, v_actual_event_id
  from public.payments p
  join public.applications a on a.id = p.application_id
  where p.id = p_payment_id;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_business_id::text || ':' || v_actual_event_id::text,
      0
    )
  );

  select e.*
  into v_event
  from public.events e
  where e.id = v_actual_event_id
  for share;

  if not found or v_actual_event_id <> p_event_id then
    raise exception 'PAYMENT_EVENT_MISMATCH' using errcode = 'P0001';
  end if;

  select p.*
  into v_payment
  from public.payments p
  where p.id = p_payment_id
  for update;

  if not found or v_payment.application_id <> v_application_id then
    raise exception 'PAYMENT_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  select a.*
  into v_application
  from public.applications a
  where a.id = v_application_id
  for update;

  if not found
     or v_application.event_id <> p_event_id
     or v_application.business_id <> v_business_id
  then
    raise exception 'PAYMENT_EVENT_MISMATCH' using errcode = 'P0001';
  end if;
  if v_payment.status <> 'paid' then
    raise exception 'PAYMENT_STATE_CONFLICT' using errcode = 'P0001';
  end if;
  if v_payment.amount is null
     or v_payment.amount::text = 'NaN'
     or v_payment.amount <= 0
     or p_refund_amount > v_payment.amount
  then
    raise exception 'INVALID_REFUND_AMOUNT' using errcode = 'P0001';
  end if;

  v_previous_status := v_payment.status;
  v_full_refund := p_refund_amount = v_payment.amount;

  update public.payments
  set status = case when v_full_refund then 'refunded' else 'partially_refunded' end,
      refund_amount = p_refund_amount,
      notes = coalesce(v_notes, v_payment.notes),
      updated_at = v_now
  where id = v_payment.id
  returning * into v_payment;

  return pg_catalog.jsonb_build_object(
    'payment_id', v_payment.id,
    'application_id', v_application.id,
    'business_id', v_application.business_id,
    'booth_id', v_application.booth_id,
    'event_id', v_application.event_id,
    'previous_status', v_previous_status,
    'status', v_payment.status,
    'amount', v_payment.amount,
    'refund_amount', v_payment.refund_amount,
    'full_refund', v_full_refund,
    'deadline_at', v_payment.deadline_at
  );
end;
$$;

create or replace function public.admin_update_payment_note(
  p_payment_id uuid,
  p_event_id uuid,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  v_application_id uuid;
  v_business_id uuid;
  v_actual_event_id uuid;
  v_payment public.payments;
  v_application public.applications;
  v_notes text := nullif(pg_catalog.btrim(p_notes), '');
  v_previous_status text;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_payment_id is null or p_event_id is null then
    raise exception 'INVALID_PAYMENT_REQUEST' using errcode = 'P0001';
  end if;
  if v_notes is not null and pg_catalog.char_length(v_notes) > 5000 then
    raise exception 'INVALID_PAYMENT_NOTES' using errcode = 'P0001';
  end if;

  select p.application_id, a.business_id, a.event_id
  into v_application_id, v_business_id, v_actual_event_id
  from public.payments p
  join public.applications a on a.id = p.application_id
  where p.id = p_payment_id;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_business_id::text || ':' || v_actual_event_id::text,
      0
    )
  );

  perform 1
  from public.events e
  where e.id = v_actual_event_id
  for share;

  if not found or v_actual_event_id <> p_event_id then
    raise exception 'PAYMENT_EVENT_MISMATCH' using errcode = 'P0001';
  end if;

  select p.*
  into v_payment
  from public.payments p
  where p.id = p_payment_id
  for update;

  if not found or v_payment.application_id <> v_application_id then
    raise exception 'PAYMENT_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  select a.*
  into v_application
  from public.applications a
  where a.id = v_application_id
  for share;

  if not found
     or v_application.event_id <> p_event_id
     or v_application.business_id <> v_business_id
  then
    raise exception 'PAYMENT_EVENT_MISMATCH' using errcode = 'P0001';
  end if;

  v_previous_status := v_payment.status;

  update public.payments
  set notes = v_notes,
      updated_at = v_now
  where id = v_payment.id
  returning * into v_payment;

  return pg_catalog.jsonb_build_object(
    'payment_id', v_payment.id,
    'application_id', v_application.id,
    'business_id', v_application.business_id,
    'booth_id', v_application.booth_id,
    'event_id', v_application.event_id,
    'previous_status', v_previous_status,
    'status', v_payment.status,
    'amount', v_payment.amount,
    'refund_amount', v_payment.refund_amount,
    'full_refund', null,
    'deadline_at', v_payment.deadline_at
  );
end;
$$;

create or replace function public.admin_update_payment_link(
  p_payment_id uuid,
  p_event_id uuid,
  p_payment_link text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  v_application_id uuid;
  v_business_id uuid;
  v_actual_event_id uuid;
  v_payment public.payments;
  v_application public.applications;
  v_link text := nullif(pg_catalog.btrim(p_payment_link), '');
  v_previous_status text;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_payment_id is null or p_event_id is null then
    raise exception 'INVALID_PAYMENT_REQUEST' using errcode = 'P0001';
  end if;
  if v_link is not null
     and (
       pg_catalog.char_length(v_link) > 2048
       or v_link ~ '[[:cntrl:]]'
       or v_link !~* '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?([/?#]|$)'
     )
  then
    raise exception 'INVALID_PAYMENT_LINK' using errcode = 'P0001';
  end if;

  select p.application_id, a.business_id, a.event_id
  into v_application_id, v_business_id, v_actual_event_id
  from public.payments p
  join public.applications a on a.id = p.application_id
  where p.id = p_payment_id;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_business_id::text || ':' || v_actual_event_id::text,
      0
    )
  );

  perform 1
  from public.events e
  where e.id = v_actual_event_id
  for share;

  if not found or v_actual_event_id <> p_event_id then
    raise exception 'PAYMENT_EVENT_MISMATCH' using errcode = 'P0001';
  end if;

  select p.*
  into v_payment
  from public.payments p
  where p.id = p_payment_id
  for update;

  if not found or v_payment.application_id <> v_application_id then
    raise exception 'PAYMENT_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  select a.*
  into v_application
  from public.applications a
  where a.id = v_application_id
  for share;

  if not found
     or v_application.event_id <> p_event_id
     or v_application.business_id <> v_business_id
  then
    raise exception 'PAYMENT_EVENT_MISMATCH' using errcode = 'P0001';
  end if;
  if v_payment.status not in (
       'not_requested', 'payment_required', 'pending_payment', 'failed', 'expired'
     )
  then
    raise exception 'PAYMENT_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  v_previous_status := v_payment.status;

  update public.payments
  set payment_link = v_link,
      method = case
        when v_link is not null then 'adcb_pace_pay'
        when v_payment.method = 'adcb_pace_pay' then null
        else v_payment.method
      end,
      updated_at = v_now
  where id = v_payment.id
  returning * into v_payment;

  return pg_catalog.jsonb_build_object(
    'payment_id', v_payment.id,
    'application_id', v_application.id,
    'business_id', v_application.business_id,
    'booth_id', v_application.booth_id,
    'event_id', v_application.event_id,
    'previous_status', v_previous_status,
    'status', v_payment.status,
    'amount', v_payment.amount,
    'refund_amount', v_payment.refund_amount,
    'full_refund', null,
    'deadline_at', v_payment.deadline_at
  );
end;
$$;

create or replace function public.admin_release_payment_booth(
  p_payment_id uuid,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  v_application_id uuid;
  v_business_id uuid;
  v_actual_event_id uuid;
  v_event public.events;
  v_payment public.payments;
  v_application public.applications;
  v_booth public.booths;
  v_previous_status text;
  v_booth_id uuid;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_payment_id is null or p_event_id is null then
    raise exception 'INVALID_PAYMENT_REQUEST' using errcode = 'P0001';
  end if;

  select p.application_id, a.business_id, a.event_id
  into v_application_id, v_business_id, v_actual_event_id
  from public.payments p
  join public.applications a on a.id = p.application_id
  where p.id = p_payment_id;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_business_id::text || ':' || v_actual_event_id::text,
      0
    )
  );

  select e.*
  into v_event
  from public.events e
  where e.id = v_actual_event_id
  for share;

  if not found or v_actual_event_id <> p_event_id then
    raise exception 'PAYMENT_EVENT_MISMATCH' using errcode = 'P0001';
  end if;

  select p.*
  into v_payment
  from public.payments p
  where p.id = p_payment_id
  for update;

  if not found or v_payment.application_id <> v_application_id then
    raise exception 'PAYMENT_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  select a.*
  into v_application
  from public.applications a
  where a.id = v_application_id
  for update;

  if not found
     or v_application.event_id <> p_event_id
     or v_application.business_id <> v_business_id
  then
    raise exception 'PAYMENT_EVENT_MISMATCH' using errcode = 'P0001';
  end if;
  if v_payment.status not in (
       'payment_required', 'pending_payment', 'pending_verification'
     )
  then
    raise exception 'PAYMENT_STATE_CONFLICT' using errcode = 'P0001';
  end if;
  if v_application.status not in ('awaiting_payment', 'payment_under_review')
     or v_application.booth_id is null
  then
    raise exception 'APPLICATION_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  select b.*
  into v_booth
  from public.booths b
  where b.id = v_application.booth_id
  for update;

  if not found
     or v_booth.event_id <> p_event_id
     or v_booth.status <> 'awaiting_payment'
     or v_booth.current_application_id is distinct from v_application.id
     or v_booth.locked_by_business_id is distinct from v_application.business_id
  then
    raise exception 'PAYMENT_BOOTH_INVALID' using errcode = 'P0001';
  end if;

  v_previous_status := v_payment.status;
  v_booth_id := v_booth.id;

  update public.booths
  set status = 'available',
      held_for_business_id = null,
      locked_by_business_id = null,
      lock_expires_at = null,
      current_application_id = null,
      updated_at = v_now
  where id = v_booth.id;

  update public.applications
  set booth_id = null,
      booth_price_before_vat = null,
      vat_amount = null,
      total_amount = null,
      status = 'approved',
      confirmed_at = null,
      updated_at = v_now
  where id = v_application.id;

  update public.payments
  set status = 'expired',
      verified_by = null,
      verified_at = null,
      updated_at = v_now
  where id = v_payment.id
  returning * into v_payment;

  insert into public.booth_events (
    booth_id, event_type, business_id, actor_id, details
  )
  values (
    v_booth_id,
    'admin_released',
    v_application.business_id,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'payment_id', v_payment.id,
      'source', 'admin_payment_release'
    )
  );

  return pg_catalog.jsonb_build_object(
    'payment_id', v_payment.id,
    'application_id', v_application.id,
    'business_id', v_application.business_id,
    'booth_id', v_booth_id,
    'event_id', v_application.event_id,
    'previous_status', v_previous_status,
    'status', v_payment.status,
    'amount', v_payment.amount,
    'refund_amount', v_payment.refund_amount,
    'full_refund', null,
    'deadline_at', v_payment.deadline_at
  );
end;
$$;

create or replace function public.admin_record_offline_payment(
  p_application_id uuid,
  p_event_id uuid,
  p_amount numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  v_business_id uuid;
  v_actual_event_id uuid;
  v_event public.events;
  v_payment public.payments;
  v_application public.applications;
  v_booth public.booths;
  v_notes text := nullif(pg_catalog.btrim(p_notes), '');
  v_previous_status text;
  v_payment_exists boolean := false;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_application_id is null or p_event_id is null then
    raise exception 'INVALID_PAYMENT_REQUEST' using errcode = 'P0001';
  end if;
  if p_amount is null
     or p_amount::text = 'NaN'
     or p_amount <> round(p_amount, 2)
     or p_amount <= 0
     or p_amount > 99999999.99
  then
    raise exception 'INVALID_PAYMENT_AMOUNT' using errcode = 'P0001';
  end if;
  if v_notes is not null and pg_catalog.char_length(v_notes) > 5000 then
    raise exception 'INVALID_PAYMENT_NOTES' using errcode = 'P0001';
  end if;

  select a.business_id, a.event_id
  into v_business_id, v_actual_event_id
  from public.applications a
  where a.id = p_application_id;

  if not found then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_business_id::text || ':' || v_actual_event_id::text,
      0
    )
  );

  select e.*
  into v_event
  from public.events e
  where e.id = v_actual_event_id
  for share;

  if not found or v_actual_event_id <> p_event_id then
    raise exception 'PAYMENT_EVENT_MISMATCH' using errcode = 'P0001';
  end if;

  select p.*
  into v_payment
  from public.payments p
  where p.application_id = p_application_id
  for update;
  v_payment_exists := found;

  if v_payment_exists then
    v_previous_status := v_payment.status;
    if v_payment.status in ('paid', 'refunded', 'partially_refunded') then
      raise exception 'PAYMENT_STATE_CONFLICT' using errcode = 'P0001';
    end if;
  end if;

  select a.*
  into v_application
  from public.applications a
  where a.id = p_application_id
  for update;

  if not found
     or v_application.event_id <> p_event_id
     or v_application.business_id <> v_business_id
  then
    raise exception 'PAYMENT_EVENT_MISMATCH' using errcode = 'P0001';
  end if;
  if v_application.status not in (
       'booth_selected', 'awaiting_payment', 'payment_under_review'
     )
     or v_application.booth_id is null
  then
    raise exception 'APPLICATION_STATE_CONFLICT' using errcode = 'P0001';
  end if;
  if v_application.total_amount is null
     or v_application.total_amount <= 0
     or p_amount is distinct from v_application.total_amount
  then
    raise exception 'PAYMENT_AMOUNT_MISMATCH' using errcode = 'P0001';
  end if;

  select b.*
  into v_booth
  from public.booths b
  where b.id = v_application.booth_id
  for update;

  if not found
     or v_booth.event_id <> p_event_id
     or v_booth.status not in ('locked', 'reserved', 'awaiting_payment')
     or v_booth.current_application_id is distinct from v_application.id
     or v_booth.locked_by_business_id is distinct from v_application.business_id
  then
    raise exception 'PAYMENT_BOOTH_INVALID' using errcode = 'P0001';
  end if;
  if v_booth.status = 'locked'
     and (
       v_booth.lock_expires_at is null
       or v_booth.lock_expires_at <= v_now
     )
  then
    raise exception 'BOOTH_LOCK_EXPIRED' using errcode = 'P0001';
  end if;

  if v_payment_exists then
    update public.payments
    set method = 'offline',
        status = 'paid',
        amount = p_amount,
        notes = v_notes,
        verified_by = v_actor_id,
        verified_at = v_now,
        rejection_reason = null,
        refund_amount = null,
        updated_at = v_now
    where id = v_payment.id
    returning * into v_payment;
  else
    insert into public.payments (
      application_id, method, status, amount, notes,
      verified_by, verified_at
    )
    values (
      v_application.id, 'offline', 'paid', p_amount, v_notes,
      v_actor_id, v_now
    )
    returning * into v_payment;
  end if;

  update public.applications
  set status = 'confirmed',
      confirmed_at = v_now,
      updated_at = v_now
  where id = v_application.id;

  update public.booths
  set status = 'confirmed',
      held_for_business_id = null,
      lock_expires_at = null,
      updated_at = v_now
  where id = v_booth.id;

  insert into public.booth_events (
    booth_id, event_type, business_id, actor_id, details
  )
  values (
    v_booth.id,
    'confirmed',
    v_application.business_id,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'payment_id', v_payment.id,
      'method', 'offline',
      'amount', p_amount,
      'source', 'admin_offline_payment'
    )
  );

  return pg_catalog.jsonb_build_object(
    'payment_id', v_payment.id,
    'application_id', v_application.id,
    'business_id', v_application.business_id,
    'booth_id', v_booth.id,
    'event_id', v_application.event_id,
    'previous_status', v_previous_status,
    'status', v_payment.status,
    'amount', v_payment.amount,
    'refund_amount', v_payment.refund_amount,
    'full_refund', null,
    'deadline_at', v_payment.deadline_at
  );
end;
$$;

-- =========================================================================
-- Atomic admin booth assignment and release
-- =========================================================================

create or replace function public.admin_assign_booth(
  p_booth_id uuid,
  p_event_id uuid,
  p_application_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  v_business_id uuid;
  v_actual_event_id uuid;
  v_business public.businesses;
  v_event public.events;
  v_booth public.booths;
  v_application public.applications;
  v_previous_status text;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_booth_id is null or p_event_id is null or p_application_id is null then
    raise exception 'INVALID_BOOTH_REQUEST' using errcode = 'P0001';
  end if;

  select a.business_id, a.event_id
  into v_business_id, v_actual_event_id
  from public.applications a
  where a.id = p_application_id;

  if not found then
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_business_id::text || ':' || v_actual_event_id::text,
      0
    )
  );

  select b.*
  into v_business
  from public.businesses b
  where b.id = v_business_id
  for share;

  if not found or v_business.approval_status <> 'approved' then
    raise exception 'BUSINESS_NOT_APPROVED' using errcode = 'P0001';
  end if;
  if v_business.requires_reapproval then
    raise exception 'BUSINESS_REAPPROVAL_REQUIRED' using errcode = 'P0001';
  end if;

  select e.*
  into v_event
  from public.events e
  where e.id = v_actual_event_id
  for share;

  if not found or v_actual_event_id <> p_event_id then
    raise exception 'BOOTH_EVENT_MISMATCH' using errcode = 'P0001';
  end if;
  if v_event.is_archived
     or (v_event.end_at is not null and v_event.end_at <= v_now)
  then
    raise exception 'EVENT_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  -- Match the booth-before-application lock order used by vendor booth RPCs.
  select b.*
  into v_booth
  from public.booths b
  where b.id = p_booth_id
  for update;

  if not found then
    raise exception 'BOOTH_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_booth.event_id <> p_event_id then
    raise exception 'BOOTH_EVENT_MISMATCH' using errcode = 'P0001';
  end if;

  select a.*
  into v_application
  from public.applications a
  where a.id = p_application_id
  for update;

  if not found
     or v_application.event_id <> p_event_id
     or v_application.business_id <> v_business_id
  then
    raise exception 'BOOTH_EVENT_MISMATCH' using errcode = 'P0001';
  end if;

  v_previous_status := v_booth.status;

  -- Safe idempotency for a retried server action: do not append duplicate
  -- history or recalculate prices when the exact assignment already exists.
  if v_booth.status = 'reserved'
     and v_booth.current_application_id = v_application.id
     and v_booth.locked_by_business_id = v_application.business_id
     and v_booth.held_for_business_id is null
     and v_booth.lock_expires_at is null
     and v_application.status = 'booth_selected'
     and v_application.booth_id = v_booth.id
     and v_application.booth_price_before_vat = v_booth.price_before_vat
     and v_application.vat_amount = public.vat_amount(v_booth.price_before_vat)
     and v_application.total_amount = v_booth.price_before_vat
                                      + public.vat_amount(v_booth.price_before_vat)
  then
    return pg_catalog.jsonb_build_object(
      'booth_id', v_booth.id,
      'booth_number', v_booth.booth_number,
      'event_id', v_booth.event_id,
      'application_id', v_application.id,
      'business_id', v_application.business_id,
      'previous_status', v_previous_status,
      'status', v_booth.status,
      'application_status', v_application.status,
      'changed', false,
      'payment_id', null,
      'payment_status', null
    );
  end if;

  if v_application.status not in ('approved', 'booth_selection_available')
     or v_application.booth_id is not null
  then
    raise exception 'APPLICATION_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;
  if v_booth.current_application_id is not null
     or v_booth.locked_by_business_id is not null
     or v_booth.lock_expires_at is not null
     or not (
       (v_booth.status = 'available' and v_booth.held_for_business_id is null)
       or (
         v_booth.status = 'admin_held'
         and v_booth.held_for_business_id = v_application.business_id
       )
     )
  then
    raise exception 'BOOTH_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.booths active_booth
    where active_booth.event_id = p_event_id
      and active_booth.id <> p_booth_id
      and (
        active_booth.current_application_id = v_application.id
        or active_booth.locked_by_business_id = v_application.business_id
      )
      and (
        active_booth.status in ('reserved', 'awaiting_payment', 'confirmed')
        or (
          active_booth.status = 'locked'
          and active_booth.lock_expires_at is not null
          and active_booth.lock_expires_at > v_now
        )
      )
  ) then
    raise exception 'ACTIVE_BOOTH_EXISTS' using errcode = 'P0001';
  end if;
  if v_booth.price_before_vat is null
     or v_booth.price_before_vat::text = 'NaN'
     or v_booth.price_before_vat < 0
  then
    raise exception 'INVALID_BOOTH_PRICE' using errcode = 'P0001';
  end if;

  update public.booths
  set status = 'reserved',
      held_for_business_id = null,
      locked_by_business_id = v_application.business_id,
      lock_expires_at = null,
      current_application_id = v_application.id,
      updated_at = v_now
  where id = v_booth.id
  returning * into v_booth;

  update public.applications
  set booth_id = v_booth.id,
      booth_price_before_vat = v_booth.price_before_vat,
      vat_amount = public.vat_amount(v_booth.price_before_vat),
      total_amount = v_booth.price_before_vat + public.vat_amount(v_booth.price_before_vat),
      status = 'booth_selected',
      confirmed_at = null,
      updated_at = v_now
  where id = v_application.id
  returning * into v_application;

  update public.waiting_list
  set status = 'accepted',
      updated_at = v_now
  where event_id = p_event_id
    and business_id = v_application.business_id
    and invited_booth_id = v_booth.id
    and status = 'invited';

  insert into public.booth_events (
    booth_id, event_type, business_id, actor_id, details
  )
  values (
    v_booth.id,
    'reserved',
    v_application.business_id,
    v_actor_id,
    pg_catalog.jsonb_build_object('source', 'admin_assignment')
  );

  return pg_catalog.jsonb_build_object(
    'booth_id', v_booth.id,
    'booth_number', v_booth.booth_number,
    'event_id', v_booth.event_id,
    'application_id', v_application.id,
    'business_id', v_application.business_id,
    'previous_status', v_previous_status,
    'status', v_booth.status,
    'application_status', v_application.status,
    'changed', true,
    'payment_id', null,
    'payment_status', null
  );
end;
$$;

create or replace function public.admin_release_booth(
  p_booth_id uuid,
  p_event_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actual_event_id uuid;
  v_expected_application_id uuid;
  v_expected_business_id uuid;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_booth public.booths;
  v_application public.applications;
  v_payment public.payments;
  v_previous_status text;
  v_previous_application_status text;
  v_payment_exists boolean := false;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if v_actor_id is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_booth_id is null or p_event_id is null then
    raise exception 'INVALID_BOOTH_REQUEST' using errcode = 'P0001';
  end if;
  if v_reason is not null and pg_catalog.char_length(v_reason) > 2000 then
    raise exception 'INVALID_RELEASE_REASON' using errcode = 'P0001';
  end if;

  select
    b.event_id,
    b.current_application_id,
    coalesce(
      b.locked_by_business_id,
      b.held_for_business_id,
      a.business_id
    )
  into
    v_actual_event_id,
    v_expected_application_id,
    v_expected_business_id
  from public.booths b
  left join public.applications a on a.id = b.current_application_id
  where b.id = p_booth_id;

  if not found then
    raise exception 'BOOTH_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Assigned rows serialize with vendor/payment work for the same business and
  -- event. A clean-row race is detected after the booth lock and never adopted.
  if v_expected_business_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_expected_business_id::text || ':' || v_actual_event_id::text,
        0
      )
    );
  end if;

  perform 1
  from public.events e
  where e.id = v_actual_event_id
  for share;

  if not found or v_actual_event_id <> p_event_id then
    raise exception 'BOOTH_EVENT_MISMATCH' using errcode = 'P0001';
  end if;

  -- For assigned booths, match the payment/application/booth order used by
  -- payment-submission RPCs. The business advisory lock serializes this with
  -- booth RPCs that intentionally lock booth/application first.
  if v_expected_application_id is not null then
    select p.*
    into v_payment
    from public.payments p
    where p.application_id = v_expected_application_id
    for update;
    v_payment_exists := found;

    select a.*
    into v_application
    from public.applications a
    where a.id = v_expected_application_id
    for update;

    if not found then
      raise exception 'BOOTH_ASSIGNMENT_INVALID' using errcode = 'P0001';
    end if;
  end if;

  select b.*
  into v_booth
  from public.booths b
  where b.id = p_booth_id
  for update;

  if not found then
    raise exception 'BOOTH_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_booth.event_id <> p_event_id then
    raise exception 'BOOTH_EVENT_MISMATCH' using errcode = 'P0001';
  end if;
  if v_booth.current_application_id is distinct from v_expected_application_id
     or coalesce(
       v_booth.locked_by_business_id,
       v_booth.held_for_business_id,
       v_application.business_id
     ) is distinct from v_expected_business_id
  then
    raise exception 'BOOTH_STATE_CONFLICT' using errcode = 'P0001';
  end if;

  v_previous_status := v_booth.status;

  if v_expected_application_id is null then
    if v_booth.status <> 'admin_held'
       or v_booth.held_for_business_id is null
       or v_booth.locked_by_business_id is not null
       or v_booth.lock_expires_at is not null
    then
      raise exception 'BOOTH_NOT_RELEASABLE' using errcode = 'P0001';
    end if;
  else
    if v_application.event_id <> p_event_id
       or v_application.business_id is distinct from v_expected_business_id
       or v_application.booth_id is distinct from v_booth.id
       or v_booth.locked_by_business_id is distinct from v_application.business_id
       or v_booth.held_for_business_id is not null
    then
      raise exception 'BOOTH_ASSIGNMENT_INVALID' using errcode = 'P0001';
    end if;

    if not (
      (v_booth.status in ('locked', 'reserved') and v_application.status = 'booth_selected')
      or (
        v_booth.status = 'awaiting_payment'
        and v_application.status in ('awaiting_payment', 'payment_under_review')
      )
      or (v_booth.status = 'confirmed' and v_application.status = 'confirmed')
    ) then
      raise exception 'BOOTH_ASSIGNMENT_INVALID' using errcode = 'P0001';
    end if;

    if v_payment_exists
       and v_payment.status in ('paid', 'partially_refunded')
    then
      raise exception 'BOOTH_PAYMENT_CONFLICT' using errcode = 'P0001';
    end if;
    if v_booth.status = 'confirmed'
       and (
         not v_payment_exists
         or v_payment.status <> 'refunded'
       )
    then
      raise exception 'BOOTH_PAYMENT_CONFLICT' using errcode = 'P0001';
    end if;
  end if;

  v_previous_application_status := v_application.status;

  if v_payment_exists and v_payment.status <> 'refunded' then
    update public.payments
    set status = 'expired',
        verified_by = null,
        verified_at = null,
        updated_at = v_now
    where id = v_payment.id
    returning * into v_payment;
  end if;

  if v_expected_application_id is not null then
    update public.applications
    set booth_id = null,
        booth_price_before_vat = null,
        vat_amount = null,
        total_amount = null,
        status = 'approved',
        confirmed_at = null,
        updated_at = v_now
    where id = v_application.id
    returning * into v_application;
  end if;

  update public.booths
  set status = 'available',
      held_for_business_id = null,
      locked_by_business_id = null,
      lock_expires_at = null,
      current_application_id = null,
      updated_at = v_now
  where id = v_booth.id
  returning * into v_booth;

  update public.waiting_list
  set status = 'removed',
      invited_booth_id = null,
      invitation_expires_at = null,
      updated_at = v_now
  where event_id = p_event_id
    and business_id = v_expected_business_id
    and invited_booth_id = v_booth.id
    and status in ('invited', 'accepted');

  insert into public.booth_events (
    booth_id, event_type, business_id, actor_id, details
  )
  values (
    v_booth.id,
    'admin_released',
    v_expected_business_id,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'reason', v_reason,
      'source', 'admin_booth_release',
      'application_id', v_expected_application_id,
      'payment_id', v_payment.id
    )
  );

  return pg_catalog.jsonb_build_object(
    'booth_id', v_booth.id,
    'booth_number', v_booth.booth_number,
    'event_id', v_booth.event_id,
    'application_id', v_expected_application_id,
    'business_id', v_expected_business_id,
    'previous_status', v_previous_status,
    'status', v_booth.status,
    'previous_application_status', v_previous_application_status,
    'application_status', case
      when v_expected_application_id is null then null
      else v_application.status
    end,
    'changed', true,
    'payment_id', v_payment.id,
    'payment_status', v_payment.status
  );
end;
$$;

-- =========================================================================
-- Waiting list
-- =========================================================================

create or replace function public.join_waiting_list(
  p_event_id uuid,
  p_preferred_booth_size text default null,
  p_max_budget numeric default null,
  p_preferred_zone_id uuid default null
)
returns public.waiting_list
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_business_id uuid;
  v_business public.businesses;
  v_event public.events;
  v_entry public.waiting_list;
  v_priority int;
  v_size text := nullif(pg_catalog.btrim(p_preferred_booth_size), '');
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  v_business_id := public.owned_business_id();
  if v_business_id is null then
    raise exception 'NO_BUSINESS' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_business_id::text || ':' || p_event_id::text, 0)
  );

  select b.*
  into v_business
  from public.businesses b
  where b.id = v_business_id
  for share;

  if not found or v_business.approval_status <> 'approved' then
    raise exception 'BUSINESS_NOT_APPROVED' using errcode = 'P0001';
  end if;
  if v_business.requires_reapproval then
    raise exception 'BUSINESS_REAPPROVAL_REQUIRED' using errcode = 'P0001';
  end if;

  select e.*
  into v_event
  from public.events e
  where e.id = p_event_id
  for share;

  if not found
     or v_event.registration_status <> 'open'
     or v_event.is_archived
     or (v_event.registration_opens_at is not null and v_event.registration_opens_at > v_now)
     or (v_event.registration_closes_at is not null and v_event.registration_closes_at <= v_now)
     or (v_event.end_at is not null and v_event.end_at <= v_now)
  then
    raise exception 'EVENT_NOT_OPEN' using errcode = 'P0001';
  end if;

  if v_size is not null and pg_catalog.char_length(v_size) > 80 then
    raise exception 'INVALID_BOOTH_SIZE' using errcode = 'P0001';
  end if;

  if p_max_budget is not null
     and (p_max_budget::text = 'NaN' or p_max_budget < 0)
  then
    raise exception 'INVALID_MAX_BUDGET' using errcode = 'P0001';
  end if;

  if p_preferred_zone_id is not null and not exists (
    select 1
    from public.zones z
    where z.id = p_preferred_zone_id
      and z.event_id = p_event_id
  ) then
    raise exception 'ZONE_EVENT_MISMATCH' using errcode = 'P0001';
  end if;

  -- Serializes rank allocation across different businesses joining the same
  -- event, so max(priority) + 1 cannot race.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('waiting-list:' || p_event_id::text, 0)
  );

  select w.*
  into v_entry
  from public.waiting_list w
  where w.event_id = p_event_id
    and w.business_id = v_business_id
  for update;

  if found and v_entry.status in ('invited', 'accepted', 'removed') then
    raise exception 'WAITING_LIST_STATE_LOCKED' using errcode = 'P0001';
  end if;

  if found then
    -- Preserve the existing priority for every permitted rejoin/update.
    update public.waiting_list
    set preferred_booth_size = v_size,
        max_budget = p_max_budget,
        preferred_zone_id = p_preferred_zone_id,
        status = 'waiting',
        invited_booth_id = null,
        invitation_expires_at = null,
        joined_at = case
          when v_entry.status = 'waiting' then v_entry.joined_at
          else v_now
        end,
        updated_at = v_now
    where id = v_entry.id
    returning * into v_entry;
  else
    select coalesce(pg_catalog.max(w.priority), 0)
    into v_priority
    from public.waiting_list w
    where w.event_id = p_event_id
      and w.status = 'waiting';

    if v_priority = 2147483647 then
      raise exception 'WAITING_LIST_PRIORITY_EXHAUSTED' using errcode = 'P0001';
    end if;
    v_priority := v_priority + 1;

    insert into public.waiting_list (
      event_id, business_id, preferred_booth_size,
      max_budget, preferred_zone_id, priority, status, joined_at
    )
    values (
      p_event_id, v_business_id, v_size,
      p_max_budget, p_preferred_zone_id, v_priority, 'waiting', v_now
    )
    returning * into v_entry;
  end if;

  return v_entry;
end;
$$;

-- Admin-only, transactional reorder. Existing duplicate/zero priorities are
-- normalized to a deterministic 1..N ordering before the adjacent swap.
create or replace function public.reorder_waiting_list(
  p_entry_id uuid,
  p_event_id uuid,
  p_direction text
)
returns public.waiting_list
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_direction text := pg_catalog.lower(pg_catalog.btrim(p_direction));
  v_entry public.waiting_list;
  v_target public.waiting_list;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if v_direction is null or v_direction not in ('up', 'down') then
    raise exception 'INVALID_DIRECTION' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('waiting-list:' || p_event_id::text, 0)
  );

  -- Lock every reorderable row in the same deterministic order.
  perform 1
  from public.waiting_list w
  where w.event_id = p_event_id
    and w.status = 'waiting'
  order by w.priority desc, w.joined_at, w.id
  for update;

  select w.*
  into v_entry
  from public.waiting_list w
  where w.id = p_entry_id
  for update;

  if not found or v_entry.event_id <> p_event_id then
    raise exception 'WAITING_ENTRY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_entry.status <> 'waiting' then
    raise exception 'WAITING_ENTRY_NOT_REORDERABLE' using errcode = 'P0001';
  end if;

  with ranked as (
    select
      w.id,
      (
        pg_catalog.count(*) over ()
        - pg_catalog.row_number() over (
          order by w.priority desc, w.joined_at, w.id
        )
        + 1
      )::int as normalized_priority
    from public.waiting_list w
    where w.event_id = p_event_id
      and w.status = 'waiting'
  )
  update public.waiting_list w
  set priority = ranked.normalized_priority,
      updated_at = v_now
  from ranked
  where w.id = ranked.id;

  select w.*
  into v_entry
  from public.waiting_list w
  where w.id = p_entry_id;

  with ordered as (
    select
      w.id,
      pg_catalog.row_number() over (
        order by w.priority desc, w.joined_at, w.id
      ) as position
    from public.waiting_list w
    where w.event_id = p_event_id
      and w.status = 'waiting'
  ),
  adjacent as (
    select candidate.id
    from ordered current_entry
    join ordered candidate
      on candidate.position = current_entry.position
        + case when v_direction = 'up' then -1 else 1 end
    where current_entry.id = p_entry_id
  )
  select w.*
  into v_target
  from public.waiting_list w
  join adjacent a on a.id = w.id;

  -- Moving beyond either end is an idempotent success.
  if not found then
    return v_entry;
  end if;

  update public.waiting_list w
  set priority = case
        when w.id = v_entry.id then v_target.priority
        else v_entry.priority
      end,
      updated_at = v_now
  where w.id in (v_entry.id, v_target.id);

  select w.*
  into v_entry
  from public.waiting_list w
  where w.id = p_entry_id;

  return v_entry;
end;
$$;

-- Admin-only, transactional invitation. The expiry is always derived by the
-- database (30 minutes), and booth + waiting-list state change together.
create or replace function public.invite_from_waiting_list(
  p_entry_id uuid,
  p_event_id uuid,
  p_booth_id uuid
)
returns public.waiting_list
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_event public.events;
  v_booth public.booths;
  v_entry public.waiting_list;
  v_business public.businesses;
  v_now timestamptz := pg_catalog.statement_timestamp();
  v_expires_at timestamptz := v_now + interval '30 minutes';
begin
  if not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('waiting-list:' || p_event_id::text, 0)
  );

  select e.*
  into v_event
  from public.events e
  where e.id = p_event_id
  for share;

  if not found
     or v_event.registration_status <> 'open'
     or v_event.is_archived
     or (v_event.registration_opens_at is not null and v_event.registration_opens_at > v_now)
     or (v_event.registration_closes_at is not null and v_event.registration_closes_at <= v_now)
     or (v_event.end_at is not null and v_event.end_at <= v_now)
  then
    raise exception 'EVENT_NOT_OPEN' using errcode = 'P0001';
  end if;

  -- Booth-first matches lock_booth's lock order.
  select b.*
  into v_booth
  from public.booths b
  where b.id = p_booth_id
  for update;

  if not found or v_booth.event_id <> p_event_id then
    raise exception 'BOOTH_EVENT_MISMATCH' using errcode = 'P0001';
  end if;
  if v_booth.status <> 'available'
     or v_booth.held_for_business_id is not null
     or v_booth.locked_by_business_id is not null
     or v_booth.lock_expires_at is not null
     or v_booth.current_application_id is not null
  then
    raise exception 'BOOTH_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select w.*
  into v_entry
  from public.waiting_list w
  where w.id = p_entry_id
  for update;

  if not found or v_entry.event_id <> p_event_id then
    raise exception 'WAITING_ENTRY_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_entry.status <> 'waiting' then
    raise exception 'WAITING_ENTRY_NOT_INVITABLE' using errcode = 'P0001';
  end if;

  select business.*
  into v_business
  from public.businesses business
  where business.id = v_entry.business_id
  for share;

  if not found or v_business.approval_status <> 'approved' then
    raise exception 'BUSINESS_NOT_APPROVED' using errcode = 'P0001';
  end if;
  if v_business.requires_reapproval then
    raise exception 'BUSINESS_REAPPROVAL_REQUIRED' using errcode = 'P0001';
  end if;

  update public.booths
  set status = 'admin_held',
      held_for_business_id = v_entry.business_id,
      locked_by_business_id = null,
      lock_expires_at = null,
      current_application_id = null,
      updated_at = v_now
  where id = p_booth_id;

  update public.waiting_list
  set status = 'invited',
      invited_booth_id = p_booth_id,
      invitation_expires_at = v_expires_at,
      updated_at = v_now
  where id = p_entry_id
  returning * into v_entry;

  insert into public.booth_events (
    booth_id, event_type, business_id, actor_id, details
  )
  values (
    p_booth_id,
    'admin_held',
    v_entry.business_id,
    auth.uid(),
    pg_catalog.jsonb_build_object(
      'waiting_list_id', v_entry.id,
      'invitation_expires_at', v_expires_at,
      'duration_minutes', 30,
      'duration_source', 'server'
    )
  );

  return v_entry;
end;
$$;

-- =========================================================================
-- Function execution grants
-- =========================================================================

-- PostgreSQL grants EXECUTE to PUBLIC when a function is created. Revoke that
-- implicit grant on every privilege-bearing helper/RPC, then grant only the
-- roles that use it. Application admins also connect as `authenticated`; their
-- elevated authorization continues to come from public.is_admin().
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.vat_amount(numeric) from public, anon, authenticated;

revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.owned_business_id() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.owned_business_id() to authenticated, service_role;

revoke all on function public.check_email_available(text) from public, anon, authenticated;
revoke all on function public.check_phone_available(text) from public, anon, authenticated;
grant execute on function public.check_email_available(text) to authenticated, service_role;
grant execute on function public.check_phone_available(text) to authenticated, service_role;

revoke all on function public.lock_booth(uuid, int) from public, anon, authenticated;
revoke all on function public.release_booth_lock(uuid, text) from public, anon, authenticated;
revoke all on function public.confirm_booth_selection(uuid) from public, anon, authenticated;
revoke all on function public.change_booth(uuid, uuid, int) from public, anon, authenticated;
revoke all on function public.release_expired_booth_locks(uuid) from public, anon, authenticated;
revoke all on function public.expire_overdue_payments(uuid) from public, anon, authenticated;
revoke all on function public.admin_confirm_payment(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_reject_payment(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_extend_payment_deadline(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.admin_reopen_payment(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.admin_refund_payment(uuid, uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.admin_update_payment_note(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_update_payment_link(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_release_payment_booth(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_record_offline_payment(uuid, uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.admin_assign_booth(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_release_booth(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.decline_booth_invitation(uuid) from public, anon, authenticated;
revoke all on function public.release_expired_invitations(uuid) from public, anon, authenticated;
revoke all on function public.apply_to_event(uuid) from public, anon, authenticated;
revoke all on function public.submit_adcb_payment_reference(uuid, text) from public, anon, authenticated;
revoke all on function public.submit_bank_transfer_receipt(uuid, text, text, date) from public, anon, authenticated;
revoke all on function public.join_waiting_list(uuid, text, numeric, uuid) from public, anon, authenticated;
revoke all on function public.reorder_waiting_list(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.invite_from_waiting_list(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.update_business_profile(
  text, text, text, text, text, uuid, text, text, text, text[]
) from public, anon, authenticated;
revoke all on function public.submit_business_profile_for_review() from public, anon, authenticated;

grant execute on function public.lock_booth(uuid, int) to authenticated, service_role;
grant execute on function public.release_booth_lock(uuid, text) to authenticated, service_role;
grant execute on function public.confirm_booth_selection(uuid) to authenticated, service_role;
grant execute on function public.change_booth(uuid, uuid, int) to authenticated, service_role;
grant execute on function public.release_expired_booth_locks(uuid) to authenticated, service_role;
grant execute on function public.expire_overdue_payments(uuid) to authenticated, service_role;
grant execute on function public.admin_confirm_payment(uuid, uuid) to authenticated, service_role;
grant execute on function public.admin_reject_payment(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.admin_extend_payment_deadline(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.admin_reopen_payment(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.admin_refund_payment(uuid, uuid, numeric, text) to authenticated, service_role;
grant execute on function public.admin_update_payment_note(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.admin_update_payment_link(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.admin_release_payment_booth(uuid, uuid) to authenticated, service_role;
grant execute on function public.admin_record_offline_payment(uuid, uuid, numeric, text) to authenticated, service_role;
grant execute on function public.admin_assign_booth(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.admin_release_booth(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.decline_booth_invitation(uuid) to authenticated, service_role;
grant execute on function public.release_expired_invitations(uuid) to authenticated, service_role;
grant execute on function public.apply_to_event(uuid) to authenticated, service_role;
grant execute on function public.submit_adcb_payment_reference(uuid, text) to authenticated, service_role;
grant execute on function public.submit_bank_transfer_receipt(uuid, text, text, date) to authenticated, service_role;
grant execute on function public.join_waiting_list(uuid, text, numeric, uuid) to authenticated, service_role;
grant execute on function public.reorder_waiting_list(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.invite_from_waiting_list(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.update_business_profile(
  text, text, text, text, text, uuid, text, text, text, text[]
) to authenticated, service_role;
grant execute on function public.submit_business_profile_for_review() to authenticated, service_role;
