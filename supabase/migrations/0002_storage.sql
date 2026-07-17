-- Storage buckets. Public buckets serve images directly (logos, product
-- photos, event banners). Private buckets (trade licences, payment receipts,
-- setup photos) are only reachable via signed URLs issued to the owner or an
-- admin.
insert into storage.buckets (id, name, public)
values
  ('business-logos', 'business-logos', true),
  ('product-photos', 'product-photos', true),
  ('event-banners', 'event-banners', true),
  ('trade-licenses', 'trade-licenses', false),
  ('payment-receipts', 'payment-receipts', false),
  ('setup-photos', 'setup-photos', false)
on conflict (id) do nothing;

-- Convention: object path is "{owner_auth_user_id}/{filename}" for
-- vendor-owned buckets, so storage.foldername(name)[1] identifies the owner.

-- Public buckets: anyone can view, only the owner (or an admin) can write.
create policy "business_logos_public_read" on storage.objects
  for select using (bucket_id = 'business-logos');
create policy "business_logos_owner_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'business-logos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "business_logos_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'business-logos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "business_logos_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'business-logos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy "product_photos_public_read" on storage.objects
  for select using (bucket_id = 'product-photos');
create policy "product_photos_owner_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "product_photos_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "product_photos_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy "event_banners_public_read" on storage.objects
  for select using (bucket_id = 'event-banners');
create policy "event_banners_admin_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'event-banners' and public.is_admin())
  with check (bucket_id = 'event-banners' and public.is_admin());

-- Private buckets: owner + admin only, no public read.
create policy "trade_licenses_owner_or_admin_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'trade-licenses' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "trade_licenses_owner_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'trade-licenses' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "trade_licenses_owner_or_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'trade-licenses' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "trade_licenses_owner_or_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'trade-licenses' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy "payment_receipts_owner_or_admin_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "payment_receipts_owner_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'payment-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "payment_receipts_owner_or_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'payment-receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create policy "setup_photos_admin_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'setup-photos' and public.is_admin())
  with check (bucket_id = 'setup-photos' and public.is_admin());
