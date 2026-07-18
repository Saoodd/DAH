-- Extends confirm_booth_selection (from 0003) to also open the payment
-- record. Kept in the same SECURITY DEFINER function rather than granting
-- vendors an INSERT policy on public.payments, so "who can create a
-- payment row" stays a single, auditable privilege boundary.
create or replace function public.confirm_booth_selection(p_booth_id uuid)
returns public.booths
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_booth public.booths;
  v_event public.events;
  v_application public.applications;
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

  select * into v_event from public.events where id = v_booth.event_id;

  update public.booths
  set status = 'awaiting_payment',
      lock_expires_at = null,
      updated_at = now()
  where id = p_booth_id
  returning * into v_booth;

  update public.applications
  set status = 'awaiting_payment'
  where id = v_booth.current_application_id
  returning * into v_application;

  insert into public.payments (application_id, status, amount, deadline_at)
  values (
    v_application.id,
    'payment_required',
    v_application.total_amount,
    now() + make_interval(mins => coalesce(v_event.payment_deadline_minutes, 60))
  )
  on conflict (application_id) do update
    set status = 'payment_required',
        amount = excluded.amount,
        deadline_at = excluded.deadline_at,
        rejection_reason = null,
        updated_at = now();

  insert into public.booth_events (booth_id, event_type, business_id, actor_id)
  values (p_booth_id, 'awaiting_payment', v_business_id, auth.uid());

  return v_booth;
end;
$$;

grant execute on function public.confirm_booth_selection(uuid) to authenticated;

-- One payment "slot" per application makes the upsert above well-defined,
-- and matches the product model (a fresh booth selection reopens it).
alter table public.payments add constraint payments_application_id_unique unique (application_id);
