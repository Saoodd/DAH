-- Closes the same class of gap as 0008, on businesses: the vendor RLS
-- UPDATE policy checked row ownership only, not columns — a vendor could
-- call the REST API directly and set their own approval_status =
-- 'approved', clearing the entire admin review step. Profile edits and
-- profile submission now go through narrow SECURITY DEFINER functions;
-- approval_status/reviewed_at/reviewed_by/rejection_reason/
-- requires_reapproval can only be written by an admin (or by these two
-- functions, in the one specific way each is allowed to).
--
-- businesses_insert_own is also dropped: signup always creates the row via
-- the service-role client (before the vendor has a session to act with),
-- and owner_id is unique, so this policy was unused and only added risk.

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
set search_path = public
as $$
declare
  v_business_id uuid;
  v_business public.businesses;
begin
  v_business_id := public.owned_business_id();
  if v_business_id is null then
    raise exception 'NO_BUSINESS' using errcode = 'P0001';
  end if;

  select * into v_business from public.businesses where id = v_business_id for update;

  update public.businesses
  set business_name = p_business_name,
      owner_name = p_owner_name,
      email = p_email,
      phone = p_phone,
      instagram_username = p_instagram_username,
      category_id = p_category_id,
      description = p_description,
      logo_url = coalesce(p_logo_url, logo_url),
      trade_license_url = coalesce(p_trade_license_url, trade_license_url),
      product_photo_urls = case
        when p_new_product_photo_urls is not null then product_photo_urls || p_new_product_photo_urls
        else product_photo_urls
      end,
      last_profile_update = now(),
      -- Material edits to an already-approved profile require re-review.
      requires_reapproval = case when v_business.approval_status = 'approved' then true else v_business.requires_reapproval end
  where id = v_business_id
  returning * into v_business;

  return v_business;
end;
$$;

grant execute on function public.update_business_profile(text, text, text, text, text, uuid, text, text, text, text[]) to authenticated;

create or replace function public.submit_business_profile_for_review()
returns public.businesses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_business public.businesses;
begin
  v_business_id := public.owned_business_id();
  if v_business_id is null then
    raise exception 'NO_BUSINESS' using errcode = 'P0001';
  end if;

  select * into v_business from public.businesses where id = v_business_id for update;
  if v_business.approval_status not in ('profile_incomplete', 'rejected') then
    raise exception 'ALREADY_SUBMITTED' using errcode = 'P0001';
  end if;

  update public.businesses
  set approval_status = 'pending_review', submitted_at = now(), requires_reapproval = false
  where id = v_business_id
  returning * into v_business;

  return v_business;
end;
$$;

grant execute on function public.submit_business_profile_for_review() to authenticated;

drop policy if exists "businesses_insert_own" on public.businesses;
drop policy if exists "businesses_update_own_or_admin" on public.businesses;

create policy "businesses_admin_update" on public.businesses
  for update using (public.is_admin()) with check (public.is_admin());
