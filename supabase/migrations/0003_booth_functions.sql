-- Vendor-facing booth selection functions. Vendors have no direct UPDATE
-- grant on public.booths (see 0001_init.sql RLS) — these SECURITY DEFINER
-- functions are the only way a vendor's booth selection can change booth
-- rows, so every concurrency/ownership guarantee lives in one place.
--
-- Admin booth CRUD (create/edit/move/resize/delete/hold/reserve/confirm/
-- release/swap) does NOT need these — admins already have full RLS access
-- to booths and applications and those operations aren't concurrency
-- sensitive the way "two vendors click the same booth" is.

create or replace function public.vat_amount(p_price numeric)
returns numeric
language sql
immutable
as $$
  select round(p_price * 0.05, 2);
$$;

-- Atomically locks an available (or expired-lock) booth for the caller's
-- business and links it to their application. Returns the updated booth row.
create or replace function public.lock_booth(p_booth_id uuid, p_lock_minutes int default 5)
returns public.booths
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_booth public.booths;
  v_application public.applications;
begin
  v_business_id := public.owned_business_id();
  if v_business_id is null then
    raise exception 'NO_BUSINESS' using errcode = 'P0001';
  end if;

  select * into v_booth from public.booths where id = p_booth_id for update;
  if not found then
    raise exception 'BOOTH_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_application
    from public.applications
    where event_id = v_booth.event_id and business_id = v_business_id
    for update;

  if not found or v_application.status not in ('approved', 'booth_selection_available', 'booth_selected') then
    raise exception 'APPLICATION_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;

  if not (
    v_booth.status = 'available'
    or (v_booth.status = 'locked' and (v_booth.lock_expires_at is null or v_booth.lock_expires_at < now()))
    or (v_booth.status = 'locked' and v_booth.locked_by_business_id = v_business_id)
  ) then
    raise exception 'BOOTH_UNAVAILABLE' using errcode = 'P0001';
  end if;

  update public.booths
  set status = 'locked',
      locked_by_business_id = v_business_id,
      lock_expires_at = now() + make_interval(mins => p_lock_minutes),
      current_application_id = v_application.id,
      updated_at = now()
  where id = p_booth_id
  returning * into v_booth;

  update public.applications
  set booth_id = p_booth_id,
      booth_price_before_vat = v_booth.price_before_vat,
      vat_amount = public.vat_amount(v_booth.price_before_vat),
      total_amount = v_booth.price_before_vat + public.vat_amount(v_booth.price_before_vat),
      status = 'booth_selected'
  where id = v_application.id;

  insert into public.booth_events (booth_id, event_type, business_id, actor_id, details)
  values (p_booth_id, 'locked', v_business_id, auth.uid(), jsonb_build_object('lock_minutes', p_lock_minutes));

  return v_booth;
end;
$$;

grant execute on function public.lock_booth(uuid, int) to authenticated;

-- Releases the caller's own lock (does not touch confirmed/other vendors' booths).
create or replace function public.release_booth_lock(p_booth_id uuid, p_reason text default 'cancelled')
returns public.booths
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_booth public.booths;
begin
  v_business_id := public.owned_business_id();
  if v_business_id is null then
    raise exception 'NO_BUSINESS' using errcode = 'P0001';
  end if;

  select * into v_booth from public.booths where id = p_booth_id for update;
  if not found or v_booth.status <> 'locked' or v_booth.locked_by_business_id <> v_business_id then
    raise exception 'NOT_YOUR_LOCK' using errcode = 'P0001';
  end if;

  update public.applications
  set booth_id = null,
      booth_price_before_vat = null,
      vat_amount = null,
      total_amount = null,
      status = 'approved'
  where business_id = v_business_id and booth_id = p_booth_id;

  update public.booths
  set status = 'available',
      locked_by_business_id = null,
      lock_expires_at = null,
      current_application_id = null,
      updated_at = now()
  where id = p_booth_id
  returning * into v_booth;

  insert into public.booth_events (booth_id, event_type, business_id, actor_id, details)
  values (p_booth_id, 'released', v_business_id, auth.uid(), jsonb_build_object('reason', p_reason));

  return v_booth;
end;
$$;

grant execute on function public.release_booth_lock(uuid, text) to authenticated;

-- Vendor confirms their locked booth selection and moves to payment.
-- (Phase 4 owns the payment countdown/expiry; this just marks the transition.)
create or replace function public.confirm_booth_selection(p_booth_id uuid)
returns public.booths
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_booth public.booths;
begin
  v_business_id := public.owned_business_id();
  if v_business_id is null then
    raise exception 'NO_BUSINESS' using errcode = 'P0001';
  end if;

  select * into v_booth from public.booths where id = p_booth_id for update;
  if not found
     or v_booth.status <> 'locked'
     or v_booth.locked_by_business_id <> v_business_id
     or v_booth.lock_expires_at < now()
  then
    raise exception 'LOCK_EXPIRED_OR_INVALID' using errcode = 'P0001';
  end if;

  update public.booths
  set status = 'awaiting_payment',
      lock_expires_at = null,
      updated_at = now()
  where id = p_booth_id
  returning * into v_booth;

  update public.applications
  set status = 'awaiting_payment'
  where id = v_booth.current_application_id;

  insert into public.booth_events (booth_id, event_type, business_id, actor_id)
  values (p_booth_id, 'awaiting_payment', v_business_id, auth.uid());

  return v_booth;
end;
$$;

grant execute on function public.confirm_booth_selection(uuid) to authenticated;

-- Vendor swaps to a different booth before payment is confirmed. Locks the
-- new booth first — only releases the old one once the new one is secured,
-- so a failed change never loses both.
create or replace function public.change_booth(p_old_booth_id uuid, p_new_booth_id uuid, p_lock_minutes int default 5)
returns public.booths
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_old_booth public.booths;
  v_new_booth public.booths;
  v_application public.applications;
  v_event public.events;
begin
  v_business_id := public.owned_business_id();
  if v_business_id is null then
    raise exception 'NO_BUSINESS' using errcode = 'P0001';
  end if;

  select * into v_old_booth from public.booths where id = p_old_booth_id for update;
  if not found or v_old_booth.locked_by_business_id <> v_business_id then
    raise exception 'NOT_YOUR_BOOTH' using errcode = 'P0001';
  end if;
  if v_old_booth.status not in ('locked', 'awaiting_payment') then
    raise exception 'BOOTH_NOT_CHANGEABLE' using errcode = 'P0001';
  end if;

  select * into v_event from public.events where id = v_old_booth.event_id;
  if v_event.booth_changes_locked then
    raise exception 'CHANGES_LOCKED' using errcode = 'P0001';
  end if;

  select * into v_application from public.applications where id = v_old_booth.current_application_id for update;
  if not found or v_application.status = 'confirmed' then
    raise exception 'APPLICATION_NOT_ELIGIBLE' using errcode = 'P0001';
  end if;

  select * into v_new_booth from public.booths where id = p_new_booth_id for update;
  if not found then
    raise exception 'BOOTH_NOT_FOUND' using errcode = 'P0001';
  end if;
  if not (v_new_booth.status = 'available'
    or (v_new_booth.status = 'locked' and (v_new_booth.lock_expires_at is null or v_new_booth.lock_expires_at < now()))
  ) then
    raise exception 'BOOTH_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- Secure the new booth first.
  update public.booths
  set status = v_old_booth.status, -- preserve whether they were mid-lock or already at awaiting_payment
      locked_by_business_id = v_business_id,
      lock_expires_at = case when v_old_booth.status = 'locked' then now() + make_interval(mins => p_lock_minutes) else null end,
      current_application_id = v_application.id,
      updated_at = now()
  where id = p_new_booth_id
  returning * into v_new_booth;

  -- Now release the old one.
  update public.booths
  set status = 'available',
      locked_by_business_id = null,
      lock_expires_at = null,
      current_application_id = null,
      updated_at = now()
  where id = p_old_booth_id;

  update public.applications
  set booth_id = p_new_booth_id,
      booth_price_before_vat = v_new_booth.price_before_vat,
      vat_amount = public.vat_amount(v_new_booth.price_before_vat),
      total_amount = v_new_booth.price_before_vat + public.vat_amount(v_new_booth.price_before_vat)
  where id = v_application.id;

  insert into public.booth_change_log (application_id, old_booth_id, new_booth_id, old_price, new_price, changed_by, reason)
  values (v_application.id, p_old_booth_id, p_new_booth_id, v_old_booth.price_before_vat, v_new_booth.price_before_vat, auth.uid(), 'vendor_change');

  insert into public.booth_events (booth_id, event_type, business_id, actor_id, details)
  values (p_new_booth_id, 'swapped', v_business_id, auth.uid(), jsonb_build_object('from_booth', p_old_booth_id));
  insert into public.booth_events (booth_id, event_type, business_id, actor_id, details)
  values (p_old_booth_id, 'released', v_business_id, auth.uid(), jsonb_build_object('reason', 'changed_to', 'to_booth', p_new_booth_id));

  return v_new_booth;
end;
$$;

grant execute on function public.change_booth(uuid, uuid, int) to authenticated;

-- Self-healing sweep: flips any booth whose lock has expired back to
-- available. Safe to call opportunistically from any authenticated
-- context (e.g. before rendering the floor plan) — it only ever touches
-- rows that are already stale, so it cannot race a legitimate holder.
create or replace function public.release_expired_booth_locks(p_event_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_booth record;
begin
  for v_booth in
    select id, current_application_id from public.booths
    where status = 'locked'
      and lock_expires_at is not null
      and lock_expires_at < now()
      and (p_event_id is null or event_id = p_event_id)
  loop
    update public.booths
    set status = 'available', locked_by_business_id = null, lock_expires_at = null, current_application_id = null, updated_at = now()
    where id = v_booth.id;

    if v_booth.current_application_id is not null then
      update public.applications
      set booth_id = null, booth_price_before_vat = null, vat_amount = null, total_amount = null, status = 'approved'
      where id = v_booth.current_application_id and status = 'booth_selected';
    end if;

    insert into public.booth_events (booth_id, event_type, details)
    values (v_booth.id, 'expired', jsonb_build_object('auto', true));

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.release_expired_booth_locks(uuid) to authenticated;
