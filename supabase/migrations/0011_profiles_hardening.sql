-- CRITICAL: profiles_update_own allowed any authenticated user to UPDATE
-- their own profiles row with no column restriction — including `role`.
-- A vendor could call the Supabase REST API directly (PATCH
-- /rest/v1/profiles?id=eq.<their-uid> with {"role":"admin"}) and grant
-- themselves full admin access, since is_admin() and every requireAdmin()
-- check in the app is defined entirely in terms of profiles.role.
--
-- No legitimate app code depends on a vendor updating their own profiles
-- row (the display name shown throughout the app is businesses.owner_name,
-- not profiles.full_name, which is only ever set once by the
-- handle_new_user() trigger at signup) — so the fix is to remove
-- self-update entirely rather than try to carve out a safe subset of
-- columns.
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_admin_update" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- audit_logs: the original insert policy allowed any authenticated user to
-- write a row with an arbitrary actor_id, e.g. a vendor logging an action
-- attributed to a different user or an admin. logAudit() (lib/audit.ts) is
-- called from both vendor- and admin-session clients by design — the fix
-- is requiring actor_id to match the caller (or be null for system
-- entries), not restricting who can call it.
drop policy if exists "audit_logs_insert_authenticated" on public.audit_logs;

create policy "audit_logs_insert_self_or_admin" on public.audit_logs
  for insert with check (actor_id is null or actor_id = auth.uid() or public.is_admin());
