-- Self-healing sweep for payment deadlines, mirroring
-- release_expired_booth_locks: flips any payment past its deadline to
-- 'expired', releases the linked booth back to available, and resets the
-- application to 'approved' so the vendor can pick another booth — the
-- application itself is preserved, never deleted.
create or replace function public.expire_overdue_payments(p_event_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_payment record;
  v_application public.applications;
begin
  for v_payment in
    select p.id, p.application_id
    from public.payments p
    join public.applications a on a.id = p.application_id
    where p.status in ('payment_required', 'pending_payment')
      and p.deadline_at is not null
      and p.deadline_at < now()
      and (p_event_id is null or a.event_id = p_event_id)
  loop
    update public.payments set status = 'expired', updated_at = now() where id = v_payment.id;

    select * into v_application from public.applications where id = v_payment.application_id;

    if v_application.booth_id is not null then
      update public.booths
      set status = 'available', locked_by_business_id = null, lock_expires_at = null, current_application_id = null, updated_at = now()
      where id = v_application.booth_id and status = 'awaiting_payment';

      insert into public.booth_events (booth_id, event_type, business_id, details)
      values (v_application.booth_id, 'expired', v_application.business_id, jsonb_build_object('reason', 'payment_expired'));
    end if;

    update public.applications
    set booth_id = null, booth_price_before_vat = null, vat_amount = null, total_amount = null, status = 'approved'
    where id = v_application.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.expire_overdue_payments(uuid) to authenticated;
