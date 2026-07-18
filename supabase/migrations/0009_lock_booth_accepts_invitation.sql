-- Extends lock_booth once more: after 0008 removed vendors' direct RLS
-- write access to waiting_list, accepting an invitation (which locks the
-- admin_held booth via lock_booth) also needs to flip that waiting_list
-- row to 'accepted' — folded in here since lock_booth is exactly the
-- function an invitation-accept calls, keeping the privilege boundary in
-- one place rather than adding a separate RPC.
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
  v_was_admin_held boolean;
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
    or (v_booth.status = 'admin_held' and v_booth.held_for_business_id = v_business_id)
  ) then
    raise exception 'BOOTH_UNAVAILABLE' using errcode = 'P0001';
  end if;

  v_was_admin_held := v_booth.status = 'admin_held' and v_booth.held_for_business_id = v_business_id;

  update public.booths
  set status = 'locked',
      locked_by_business_id = v_business_id,
      held_for_business_id = null,
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

  if v_was_admin_held then
    update public.waiting_list
    set status = 'accepted'
    where event_id = v_booth.event_id and business_id = v_business_id and status = 'invited' and invited_booth_id = p_booth_id;
  end if;

  insert into public.booth_events (booth_id, event_type, business_id, actor_id, details)
  values (p_booth_id, 'locked', v_business_id, auth.uid(), jsonb_build_object('lock_minutes', p_lock_minutes));

  return v_booth;
end;
$$;

grant execute on function public.lock_booth(uuid, int) to authenticated;
