-- Security hardening: vendors previously had blanket RLS UPDATE/INSERT
-- access on applications, payments, and waiting_list. RLS only checks row
-- ownership, not which columns or values are being written — so a vendor
-- calling the Supabase REST API directly (bypassing the app's Server
-- Actions entirely) could set payments.status = 'paid' on their own row,
-- confirm their own application, or set their own waiting_list priority to
-- win the queue. This closes those gaps the same way booths were already
-- handled in 0003: narrow SECURITY DEFINER functions are the only way a
-- vendor's session can write to these tables; direct RLS write access is
-- removed.

-- =========================================================================
-- applications
-- =========================================================================
create or replace function public.apply_to_event(p_event_id uuid)
returns public.applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_business public.businesses;
  v_event public.events;
  v_application public.applications;
  v_now timestamptz := now();
begin
  v_business_id := public.owned_business_id();
  if v_business_id is null then
    raise exception 'NO_BUSINESS' using errcode = 'P0001';
  end if;

  select * into v_business from public.businesses where id = v_business_id;
  if v_business.approval_status <> 'approved' then
    raise exception 'BUSINESS_NOT_APPROVED' using errcode = 'P0001';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.registration_status <> 'open' then
    raise exception 'EVENT_NOT_OPEN' using errcode = 'P0001';
  end if;

  select * into v_application
    from public.applications
    where event_id = p_event_id and business_id = v_business_id
    for update;

  if found and v_application.status <> 'not_started' then
    raise exception 'ALREADY_APPLIED' using errcode = 'P0001';
  end if;

  -- Already approved at the business level — no second manual review for a
  -- routine event, unless the admin flagged this business for reapproval.
  if found then
    update public.applications
    set status = case when v_business.requires_reapproval then 'submitted' else 'approved' end,
        submitted_at = v_now,
        reviewed_at = case when v_business.requires_reapproval then null else v_now end
    where id = v_application.id
    returning * into v_application;
  else
    insert into public.applications (event_id, business_id, status, submitted_at, reviewed_at)
    values (
      p_event_id,
      v_business_id,
      case when v_business.requires_reapproval then 'submitted' else 'approved' end,
      v_now,
      case when v_business.requires_reapproval then null else v_now end
    )
    returning * into v_application;
  end if;

  return v_application;
end;
$$;

grant execute on function public.apply_to_event(uuid) to authenticated;

drop policy if exists "applications_insert_own" on public.applications;
drop policy if exists "applications_update_own_or_admin" on public.applications;

create policy "applications_admin_write" on public.applications
  for all using (public.is_admin()) with check (public.is_admin());

-- =========================================================================
-- payments
-- =========================================================================
create or replace function public.submit_adcb_payment_reference(p_payment_id uuid, p_reference text)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_payment public.payments;
begin
  v_business_id := public.owned_business_id();
  if v_business_id is null then
    raise exception 'NO_BUSINESS' using errcode = 'P0001';
  end if;

  select p.* into v_payment
    from public.payments p
    join public.applications a on a.id = p.application_id
    where p.id = p_payment_id and a.business_id = v_business_id
    for update;

  if not found or v_payment.status not in ('payment_required', 'pending_payment') then
    raise exception 'PAYMENT_NOT_EDITABLE' using errcode = 'P0001';
  end if;

  update public.payments
  set method = 'adcb_pace_pay', status = 'pending_payment', payment_reference = p_reference, updated_at = now()
  where id = p_payment_id
  returning * into v_payment;

  return v_payment;
end;
$$;

grant execute on function public.submit_adcb_payment_reference(uuid, text) to authenticated;

create or replace function public.submit_bank_transfer_receipt(
  p_payment_id uuid,
  p_receipt_path text,
  p_transfer_reference text,
  p_transfer_date date
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_payment public.payments;
begin
  v_business_id := public.owned_business_id();
  if v_business_id is null then
    raise exception 'NO_BUSINESS' using errcode = 'P0001';
  end if;

  select p.* into v_payment
    from public.payments p
    join public.applications a on a.id = p.application_id
    where p.id = p_payment_id and a.business_id = v_business_id
    for update;

  if not found or v_payment.status not in ('payment_required', 'pending_payment', 'receipt_uploaded') then
    raise exception 'PAYMENT_NOT_EDITABLE' using errcode = 'P0001';
  end if;

  update public.payments
  set method = 'bank_transfer',
      status = 'pending_verification',
      receipt_url = p_receipt_path,
      transfer_reference = p_transfer_reference,
      transfer_date = p_transfer_date,
      rejection_reason = null,
      updated_at = now()
  where id = p_payment_id
  returning * into v_payment;

  return v_payment;
end;
$$;

grant execute on function public.submit_bank_transfer_receipt(uuid, text, text, date) to authenticated;

drop policy if exists "payments_update_own_or_admin" on public.payments;

create policy "payments_admin_update" on public.payments
  for update using (public.is_admin()) with check (public.is_admin());

-- =========================================================================
-- waiting_list
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
set search_path = public
as $$
declare
  v_business_id uuid;
  v_entry public.waiting_list;
begin
  v_business_id := public.owned_business_id();
  if v_business_id is null then
    raise exception 'NO_BUSINESS' using errcode = 'P0001';
  end if;

  insert into public.waiting_list (event_id, business_id, preferred_booth_size, max_budget, preferred_zone_id, status, joined_at)
  values (p_event_id, v_business_id, p_preferred_booth_size, p_max_budget, p_preferred_zone_id, 'waiting', now())
  on conflict (event_id, business_id) do update
    set preferred_booth_size = excluded.preferred_booth_size,
        max_budget = excluded.max_budget,
        preferred_zone_id = excluded.preferred_zone_id,
        status = 'waiting',
        joined_at = now()
  returning * into v_entry;

  return v_entry;
end;
$$;

grant execute on function public.join_waiting_list(uuid, text, numeric, uuid) to authenticated;

drop policy if exists "waiting_list_insert_own" on public.waiting_list;
drop policy if exists "waiting_list_update_own_or_admin" on public.waiting_list;

create policy "waiting_list_admin_write" on public.waiting_list
  for all using (public.is_admin()) with check (public.is_admin());
