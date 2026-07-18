-- Extends lock_booth so a vendor can also accept a booth an admin has
-- specifically held for them via a waiting-list invitation
-- (status = 'admin_held', held_for_business_id = them). All other
-- guards are unchanged from 0003.
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
    or (v_booth.status = 'admin_held' and v_booth.held_for_business_id = v_business_id)
  ) then
    raise exception 'BOOTH_UNAVAILABLE' using errcode = 'P0001';
  end if;

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

  insert into public.booth_events (booth_id, event_type, business_id, actor_id, details)
  values (p_booth_id, 'locked', v_business_id, auth.uid(), jsonb_build_object('lock_minutes', p_lock_minutes));

  return v_booth;
end;
$$;

grant execute on function public.lock_booth(uuid, int) to authenticated;

-- Vendor declines a waiting-list invitation: releases the held booth and
-- marks the waiting-list entry declined. Requires the invitation to belong
-- to the caller's business.
create or replace function public.decline_booth_invitation(p_waiting_list_id uuid)
returns void
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

  select * into v_entry from public.waiting_list where id = p_waiting_list_id for update;
  if not found or v_entry.business_id <> v_business_id or v_entry.status <> 'invited' then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.waiting_list set status = 'declined' where id = p_waiting_list_id;

  if v_entry.invited_booth_id is not null then
    update public.booths
    set status = 'available', held_for_business_id = null, updated_at = now()
    where id = v_entry.invited_booth_id and status = 'admin_held' and held_for_business_id = v_business_id;

    insert into public.booth_events (booth_id, event_type, business_id, details)
    values (v_entry.invited_booth_id, 'admin_released', v_business_id, jsonb_build_object('reason', 'invitation_declined'));
  end if;
end;
$$;

grant execute on function public.decline_booth_invitation(uuid) to authenticated;

-- Self-healing sweep for waiting-list invitations, same pattern as booth
-- locks and payment deadlines.
create or replace function public.release_expired_invitations(p_event_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_entry record;
begin
  for v_entry in
    select id, invited_booth_id, business_id from public.waiting_list
    where status = 'invited'
      and invitation_expires_at is not null
      and invitation_expires_at < now()
      and (p_event_id is null or event_id = p_event_id)
  loop
    update public.waiting_list set status = 'expired' where id = v_entry.id;

    if v_entry.invited_booth_id is not null then
      update public.booths
      set status = 'available', held_for_business_id = null, updated_at = now()
      where id = v_entry.invited_booth_id and status = 'admin_held' and held_for_business_id = v_entry.business_id;

      insert into public.booth_events (booth_id, event_type, business_id, details)
      values (v_entry.invited_booth_id, 'admin_released', v_entry.business_id, jsonb_build_object('reason', 'invitation_expired'));
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.release_expired_invitations(uuid) to authenticated;
