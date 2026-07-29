# Supabase security staging checks

Run these checks only in a disposable or staging Supabase project after all
migrations through `0012_security_and_integrity_hardening.sql` have applied.
Never run the fixture block in production. The examples assume execution from
the SQL editor as the project database owner.

## 1. Privilege and policy checks

These queries are read-only and can be run independently:

```sql
select
  has_function_privilege('anon', 'public.lock_booth(uuid,integer)', 'EXECUTE')
    as anon_cannot_lock,
  has_function_privilege('authenticated', 'public.lock_booth(uuid,integer)', 'EXECUTE')
    as authenticated_can_lock,
  has_function_privilege('anon', 'public.check_email_available(text)', 'EXECUTE')
    as anon_cannot_check_email,
  has_function_privilege('anon', 'public.check_phone_available(text)', 'EXECUTE')
    as anon_cannot_check_phone,
  has_function_privilege('authenticated', 'public.check_email_available(text)', 'EXECUTE')
    as authenticated_can_check_email,
  has_function_privilege('authenticated', 'public.check_phone_available(text)', 'EXECUTE')
    as authenticated_can_check_phone,
  has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
    as anon_cannot_call_signup_trigger,
  has_table_privilege('authenticated', 'public.audit_logs', 'INSERT')
    as authenticated_cannot_insert_audit;
```

Expected values, in order: `false, true, false, false, true, true, false, false`.

Admin payment RPCs must be callable only by authenticated sessions; each RPC
performs its own profile-role check before touching data:

```sql
select
  has_function_privilege('anon', 'public.admin_confirm_payment(uuid,uuid)', 'EXECUTE')
    as anon_cannot_confirm_payment,
  has_function_privilege('authenticated', 'public.admin_confirm_payment(uuid,uuid)', 'EXECUTE')
    as authenticated_can_attempt_confirm_payment,
  has_function_privilege('anon', 'public.admin_reject_payment(uuid,uuid,text)', 'EXECUTE')
    as anon_cannot_reject_payment,
  has_function_privilege('authenticated', 'public.admin_reject_payment(uuid,uuid,text)', 'EXECUTE')
    as authenticated_can_attempt_reject_payment,
  has_function_privilege('anon', 'public.admin_extend_payment_deadline(uuid,uuid,integer)', 'EXECUTE')
    as anon_cannot_extend_payment,
  has_function_privilege('authenticated', 'public.admin_extend_payment_deadline(uuid,uuid,integer)', 'EXECUTE')
    as authenticated_can_attempt_extend_payment,
  has_function_privilege('anon', 'public.admin_reopen_payment(uuid,uuid,integer)', 'EXECUTE')
    as anon_cannot_reopen_payment,
  has_function_privilege('authenticated', 'public.admin_reopen_payment(uuid,uuid,integer)', 'EXECUTE')
    as authenticated_can_attempt_reopen_payment,
  has_function_privilege('anon', 'public.admin_refund_payment(uuid,uuid,numeric,text)', 'EXECUTE')
    as anon_cannot_refund_payment,
  has_function_privilege('authenticated', 'public.admin_refund_payment(uuid,uuid,numeric,text)', 'EXECUTE')
    as authenticated_can_attempt_refund_payment,
  has_function_privilege('anon', 'public.admin_update_payment_note(uuid,uuid,text)', 'EXECUTE')
    as anon_cannot_update_payment_note,
  has_function_privilege('authenticated', 'public.admin_update_payment_note(uuid,uuid,text)', 'EXECUTE')
    as authenticated_can_attempt_update_payment_note,
  has_function_privilege('anon', 'public.admin_update_payment_link(uuid,uuid,text)', 'EXECUTE')
    as anon_cannot_update_payment_link,
  has_function_privilege('authenticated', 'public.admin_update_payment_link(uuid,uuid,text)', 'EXECUTE')
    as authenticated_can_attempt_update_payment_link,
  has_function_privilege('anon', 'public.admin_release_payment_booth(uuid,uuid)', 'EXECUTE')
    as anon_cannot_release_payment_booth,
  has_function_privilege('authenticated', 'public.admin_release_payment_booth(uuid,uuid)', 'EXECUTE')
    as authenticated_can_attempt_release_payment_booth,
  has_function_privilege('anon', 'public.admin_record_offline_payment(uuid,uuid,numeric,text)', 'EXECUTE')
    as anon_cannot_record_offline_payment,
  has_function_privilege('authenticated', 'public.admin_record_offline_payment(uuid,uuid,numeric,text)', 'EXECUTE')
    as authenticated_can_attempt_record_offline_payment,
  has_function_privilege('anon', 'public.admin_assign_booth(uuid,uuid,uuid)', 'EXECUTE')
    as anon_cannot_assign_booth,
  has_function_privilege('authenticated', 'public.admin_assign_booth(uuid,uuid,uuid)', 'EXECUTE')
    as authenticated_can_attempt_assign_booth,
  has_function_privilege('anon', 'public.admin_release_booth(uuid,uuid,text)', 'EXECUTE')
    as anon_cannot_release_booth,
  has_function_privilege('authenticated', 'public.admin_release_booth(uuid,uuid,text)', 'EXECUTE')
    as authenticated_can_attempt_release_booth;
```

Expected values, in order: eleven `false, true` pairs. The vendor-role assertion
below confirms that `authenticated` access alone is insufficient.

Also confirm no authenticated insert policy remains:

```sql
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'audit_logs'
  and cmd = 'INSERT';
```

Expected: zero rows.

Confirm the storage buckets enforce the intended upload boundaries:

```sql
select id, file_size_limit, allowed_mime_types
from storage.buckets
where id in (
  'business-logos',
  'product-photos',
  'event-banners',
  'trade-licenses',
  'payment-receipts',
  'setup-photos'
)
order by id;
```

Expected:

| Bucket | Maximum size | Allowed MIME types |
| --- | ---: | --- |
| `business-logos` | 3 MiB (`3145728`) | `image/png`, `image/jpeg`, `image/webp` |
| `event-banners` | 5 MiB (`5242880`) | `image/png`, `image/jpeg`, `image/webp` |
| `payment-receipts` | 8 MiB (`8388608`) | the image types above plus `application/pdf` |
| `product-photos` | 5 MiB (`5242880`) | `image/png`, `image/jpeg`, `image/webp` |
| `setup-photos` | 5 MiB (`5242880`) | `image/png`, `image/jpeg`, `image/webp` |
| `trade-licenses` | 8 MiB (`8388608`) | the image types above plus `application/pdf` |

These columns are part of the targeted Supabase Storage schema. If an obsolete
Storage schema lacks either field, the migration intentionally fails instead
of silently deploying without upload limits; upgrade Storage before retrying.


## 2. Transactional fixture

The rest of the checks use fixed UUIDs and roll back. Run this setup and the
checks below in one SQL-editor execution. If the project already uses either
fixture email address, change those two addresses first.

```sql
begin;

-- Keep the production-style one-open-event index satisfied inside the fixture.
update public.events
set registration_status = 'closed'
where registration_status = 'open';

-- Tiny assertion helpers. Dynamic SQL runs with the caller's current role.
create or replace function pg_temp.assert_true(p_ok boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_ok is distinct from true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;

create or replace function pg_temp.expect_error(p_sql text, p_fragment text)
returns void
language plpgsql
as $$
declare
  v_message text;
begin
  begin
    execute p_sql;
  exception when others then
    v_message := sqlerrm;
  end;

  if v_message is null then
    raise exception 'ASSERTION FAILED: expected error containing "%"', p_fragment;
  end if;
  if position(p_fragment in v_message) = 0 then
    raise exception 'ASSERTION FAILED: expected "%", got "%"', p_fragment, v_message;
  end if;
end;
$$;

-- Inserting auth users fires handle_new_user(). The spoofed admin role must be
-- ignored and both profiles must be vendors.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
(
  '11111111-1111-4111-8111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'security-vendor-1@example.invalid',
  crypt('not-a-real-login', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"admin","full_name":"Security Vendor One"}',
  now(), now()
),
(
  '22222222-2222-4222-8222-222222222222',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'security-vendor-2@example.invalid',
  crypt('not-a-real-login', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"vendor","full_name":"Security Vendor Two"}',
  now(), now()
);

select pg_temp.assert_true(
  (
    select bool_and(role = 'vendor')
    from public.profiles
    where id in (
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    )
  ),
  'signup metadata must not assign admin'
);

insert into public.businesses (
  id, owner_id, business_name, owner_name, email, phone,
  approval_status, requires_reapproval
)
values
(
  '11111111-1111-4111-8111-111111111101',
  '11111111-1111-4111-8111-111111111111',
  'Security Business One', 'Vendor One',
  'security-business-1@example.invalid', '+971500000001',
  'approved', false
),
(
  '22222222-2222-4222-8222-222222222202',
  '22222222-2222-4222-8222-222222222222',
  'Security Business Two', 'Vendor Two',
  'security-business-2@example.invalid', '+971500000002',
  'approved', false
);

insert into public.events (
  id, name, slug, start_at, end_at,
  registration_opens_at, registration_closes_at,
  registration_status, booth_lock_minutes, payment_deadline_minutes
)
values
(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'Security Open Event', 'security-open-event',
  now() + interval '1 day', now() + interval '3 days',
  now() - interval '1 day', now() + interval '1 day',
  'open', 7, 60
),
(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  'Security Closed Event', 'security-closed-event',
  now() + interval '1 day', now() + interval '3 days',
  now() - interval '1 day', now() + interval '1 day',
  'closed', 9, 60
);

insert into public.zones (id, event_id, name)
values
(
  'aaaaaaaa-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'Open Event Zone'
),
(
  'bbbbbbbb-0000-4000-8000-000000000002',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  'Other Event Zone'
);

insert into public.applications (id, event_id, business_id, status)
values
(
  '11111111-aaaa-4aaa-8aaa-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '11111111-1111-4111-8111-111111111101',
  'approved'
),
(
  '22222222-aaaa-4aaa-8aaa-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '22222222-2222-4222-8222-222222222202',
  'approved'
);

insert into public.booths (
  id, event_id, zone_id, booth_number, price_before_vat, status
)
values
(
  'aaaaaaaa-1000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'SEC-A', 1000, 'available'
),
(
  'aaaaaaaa-1000-4000-8000-000000000002',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'SEC-B', 1200, 'available'
),
(
  'aaaaaaaa-1000-4000-8000-000000000003',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'SEC-C', 1400, 'available'
),
(
  'bbbbbbbb-1000-4000-8000-000000000001',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  'bbbbbbbb-0000-4000-8000-000000000002',
  'SEC-X', 1600, 'available'
);

-- Authenticate subsequent RPCs as vendor one.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
```

## 3. Application and booth lock invariants

Append this directly after the fixture:

```sql
-- Applying obeys registration status and the effective scheduled window.
select pg_temp.expect_error(
  $$select public.apply_to_event(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
  )$$,
  'EVENT_NOT_OPEN'
);

reset role;
update public.events
set registration_opens_at = statement_timestamp() + interval '1 hour'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select pg_temp.expect_error(
  $$select public.apply_to_event(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  )$$,
  'EVENT_NOT_OPEN'
);

reset role;
update public.events
set registration_opens_at = statement_timestamp() - interval '1 day'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

-- Caller requests 9,999 minutes; the event's seven-minute value wins.
select public.lock_booth(
  'aaaaaaaa-1000-4000-8000-000000000001',
  9999
);

select pg_temp.assert_true(
  (
    select lock_expires_at between
      statement_timestamp() + interval '6 minutes 55 seconds'
      and statement_timestamp() + interval '7 minutes 5 seconds'
    from public.booths
    where id = 'aaaaaaaa-1000-4000-8000-000000000001'
  ),
  'lock duration must come from the event'
);

create temp table security_event_count as
select count(*)::int as value
from public.booth_events
where booth_id = 'aaaaaaaa-1000-4000-8000-000000000001'
  and event_type = 'locked';

-- A retry is idempotent: no second event and no extension.
create temp table security_lock_expiry as
select lock_expires_at as value
from public.booths
where id = 'aaaaaaaa-1000-4000-8000-000000000001';

select public.lock_booth(
  'aaaaaaaa-1000-4000-8000-000000000001',
  1
);

select pg_temp.assert_true(
  (
    select b.lock_expires_at = x.value
    from public.booths b
    cross join security_lock_expiry x
    where b.id = 'aaaaaaaa-1000-4000-8000-000000000001'
  ),
  'same-lock retry must not extend expiry'
);

select pg_temp.assert_true(
  (
    select count(*) = x.value
    from public.booth_events e
    cross join security_event_count x
    where e.booth_id = 'aaaaaaaa-1000-4000-8000-000000000001'
      and e.event_type = 'locked'
    group by x.value
  ),
  'same-lock retry must not duplicate history'
);

select pg_temp.expect_error(
  $$select public.lock_booth(
    'aaaaaaaa-1000-4000-8000-000000000002', 7
  )$$,
  'ACTIVE_BOOTH_EXISTS'
);

select pg_temp.expect_error(
  $$select public.change_booth(
    'aaaaaaaa-1000-4000-8000-000000000001',
    'aaaaaaaa-1000-4000-8000-000000000001',
    7
  )$$,
  'SAME_BOOTH'
);

select pg_temp.expect_error(
  $$select public.change_booth(
    'aaaaaaaa-1000-4000-8000-000000000001',
    'bbbbbbbb-1000-4000-8000-000000000001',
    7
  )$$,
  'BOOTH_EVENT_MISMATCH'
);

-- A valid change preserves one active booth and uses the server duration.
select public.change_booth(
  'aaaaaaaa-1000-4000-8000-000000000001',
  'aaaaaaaa-1000-4000-8000-000000000002',
  9999
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.booths
    where event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and current_application_id = '11111111-aaaa-4aaa-8aaa-111111111111'
      and status = 'locked'
  ),
  'application must have exactly one active lock'
);

-- awaiting_payment changes are rejected, preventing stale payment amounts.
reset role;

update public.booths
set status = 'awaiting_payment', lock_expires_at = null
where id = 'aaaaaaaa-1000-4000-8000-000000000002';
update public.applications
set status = 'awaiting_payment'
where id = '11111111-aaaa-4aaa-8aaa-111111111111';
set local role authenticated;

select pg_temp.expect_error(
  $$select public.change_booth(
    'aaaaaaaa-1000-4000-8000-000000000002',
    'aaaaaaaa-1000-4000-8000-000000000003',
    7
  )$$,
  'BOOTH_NOT_CHANGEABLE'
);
```

For expired-holder cleanup, reset the fixture rows as owner, then call as
vendor one:

```sql
reset role;
update public.booths
set status = 'available',
    held_for_business_id = null,
    locked_by_business_id = null,
    lock_expires_at = null,
    current_application_id = null
where id = 'aaaaaaaa-1000-4000-8000-000000000002';

update public.applications
set status = 'approved', booth_id = null,
    booth_price_before_vat = null, vat_amount = null, total_amount = null
where id = '11111111-aaaa-4aaa-8aaa-111111111111';

update public.applications
set status = 'booth_selected',
    booth_id = 'aaaaaaaa-1000-4000-8000-000000000003',
    booth_price_before_vat = 1400, vat_amount = 70, total_amount = 1470
where id = '22222222-aaaa-4aaa-8aaa-222222222222';

update public.booths
set status = 'locked',
    locked_by_business_id = '22222222-2222-4222-8222-222222222202',
    current_application_id = '22222222-aaaa-4aaa-8aaa-222222222222',
    lock_expires_at = now() - interval '1 minute'
where id = 'aaaaaaaa-1000-4000-8000-000000000003';

set local role authenticated;
select public.lock_booth(
  'aaaaaaaa-1000-4000-8000-000000000003',
  9999
);

select pg_temp.assert_true(
  (
    select status = 'approved' and booth_id is null
    from public.applications
    where id = '22222222-aaaa-4aaa-8aaa-222222222222'
  ),
  'expired previous holder must be cleaned safely'
);
```

## 4. Invitation, approval, and event checks

```sql
-- Release the current test lock as the owner before invitation checks.
select public.release_booth_lock(
  'aaaaaaaa-1000-4000-8000-000000000003',
  'security_test'
);

reset role;
update public.businesses
set requires_reapproval = true
where id = '11111111-1111-4111-8111-111111111101';
set local role authenticated;

select pg_temp.expect_error(
  $$select public.lock_booth(
    'aaaaaaaa-1000-4000-8000-000000000001', 7
  )$$,
  'BUSINESS_REAPPROVAL_REQUIRED'
);

reset role;
update public.businesses
set requires_reapproval = false
where id = '11111111-1111-4111-8111-111111111101';

update public.booths
set status = 'admin_held',
    held_for_business_id = '11111111-1111-4111-8111-111111111101'
where id = 'aaaaaaaa-1000-4000-8000-000000000001';
set local role authenticated;

select pg_temp.expect_error(
  $$select public.lock_booth(
    'aaaaaaaa-1000-4000-8000-000000000001', 7
  )$$,
  'INVITATION_INVALID'
);

reset role;
insert into public.waiting_list (
  id, event_id, business_id, status,
  invited_booth_id, invitation_expires_at
)
values (
  '11111111-cccc-4ccc-8ccc-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '11111111-1111-4111-8111-111111111101',
  'invited',
  'aaaaaaaa-1000-4000-8000-000000000001',
  now() - interval '1 minute'
);
set local role authenticated;

select pg_temp.expect_error(
  $$select public.lock_booth(
    'aaaaaaaa-1000-4000-8000-000000000001', 7
  )$$,
  'INVITATION_EXPIRED'
);

reset role;
update public.waiting_list
set invitation_expires_at = now() + interval '30 minutes'
where id = '11111111-cccc-4ccc-8ccc-111111111111';
set local role authenticated;

select public.lock_booth(
  'aaaaaaaa-1000-4000-8000-000000000001',
  9999
);

select pg_temp.assert_true(
  (
    select status = 'accepted'
    from public.waiting_list
    where id = '11111111-cccc-4ccc-8ccc-111111111111'
  ),
  'valid invitation must transition to accepted'
);
```

## 5. Payment ownership, deadline, reference, and receipt checks

Convert the valid lock to awaiting payment, then test both payment RPCs:

```sql
select public.confirm_booth_selection(
  'aaaaaaaa-1000-4000-8000-000000000001'
);

create temp table security_payment as
select id
from public.payments
where application_id = '11111111-aaaa-4aaa-8aaa-111111111111';

-- Authenticated vendors have transport-level EXECUTE access but cannot cross
-- the admin check inside payment or booth mutations.
select pg_temp.expect_error(
  format(
    'select public.admin_confirm_payment(%L, %L)',
    (select id from security_payment),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  'ADMIN_REQUIRED'
);

select pg_temp.expect_error(
  $$select public.admin_assign_booth(
    'aaaaaaaa-1000-4000-8000-000000000002',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '22222222-aaaa-4aaa-8aaa-222222222222'
  )$$,
  'ADMIN_REQUIRED'
);

select pg_temp.expect_error(
  format(
    'select public.submit_adcb_payment_reference(%L, %L)',
    (select id from security_payment),
    'x'
  ),
  'INVALID_PAYMENT_REFERENCE'
);

reset role;
update public.payments
set deadline_at = now() - interval '1 minute'
where id = (select id from security_payment);
set local role authenticated;

select pg_temp.expect_error(
  format(
    'select public.submit_adcb_payment_reference(%L, %L)',
    (select id from security_payment),
    'VALID-REFERENCE-123'
  ),
  'PAYMENT_DEADLINE_EXPIRED'
);

reset role;
update public.payments
set deadline_at = now() + interval '1 hour'
where id = (select id from security_payment);
set local role authenticated;

select public.submit_adcb_payment_reference(
  (select id from security_payment),
  '  VALID-REFERENCE-123  '
);

select pg_temp.assert_true(
  (
    select p.status = 'pending_verification'
       and p.payment_reference = 'VALID-REFERENCE-123'
       and a.status = 'payment_under_review'
    from public.payments p
    join public.applications a on a.id = p.application_id
    where p.id = (select id from security_payment)
  ),
  'ADCB submission and application transition must be atomic'
);

-- A reference submitted on time remains reviewable even after its original
-- deadline passes; the expiry sweep must not release its booth.
reset role;
update public.payments
set deadline_at = now() - interval '1 minute'
where id = (select id from security_payment);
set local role authenticated;

select public.expire_overdue_payments(
  (
    select a.event_id
    from public.payments p
    join public.applications a on a.id = p.application_id
    where p.id = (select id from security_payment)
  )
);

select pg_temp.assert_true(
  (
    select p.status = 'pending_verification'
       and a.status = 'payment_under_review'
       and b.status = 'awaiting_payment'
    from public.payments p
    join public.applications a on a.id = p.application_id
    join public.booths b on b.id = a.booth_id
    where p.id = (select id from security_payment)
  ),
  'submitted ADCB reference must survive an overdue-payment sweep'
);

-- Add an existing receipt object owned by vendor one's path convention.
reset role;
insert into storage.objects (bucket_id, name)
values (
  'payment-receipts',
  '11111111-1111-4111-8111-111111111111/security-test-receipt.pdf'
);
update public.payments
set status = 'payment_required',
    deadline_at = now() + interval '1 hour'
where id = (select id from security_payment);
update public.applications
set status = 'awaiting_payment'
where id = '11111111-aaaa-4aaa-8aaa-111111111111';
set local role authenticated;

select pg_temp.expect_error(
  format(
    'select public.submit_bank_transfer_receipt(%L, %L, %L, current_date)',
    (select id from security_payment),
    '22222222-2222-4222-8222-222222222222/not-owned.pdf',
    'TRANSFER-123'
  ),
  'RECEIPT_NOT_OWNED'
);

select pg_temp.expect_error(
  format(
    'select public.submit_bank_transfer_receipt(%L, %L, %L, current_date)',
    (select id from security_payment),
    '11111111-1111-4111-8111-111111111111/missing.pdf',
    'TRANSFER-123'
  ),
  'RECEIPT_NOT_FOUND'
);

select public.submit_bank_transfer_receipt(
  (select id from security_payment),
  '11111111-1111-4111-8111-111111111111/security-test-receipt.pdf',
  '  TRANSFER-123  ',
  current_date
);

select pg_temp.assert_true(
  (
    select p.status = 'pending_verification'
       and p.transfer_reference = 'TRANSFER-123'
       and a.status = 'payment_under_review'
    from public.payments p
    join public.applications a on a.id = p.application_id
    where p.id = (select id from security_payment)
  ),
  'receipt submission and application transition must be atomic'
);
```

To test cross-owner access, authenticate as vendor two and reuse vendor one's
payment ID:

```sql
-- Put the payment back into an otherwise editable state so ownership is the
-- only failing condition in the attacker call below.
reset role;
update public.payments
set status = 'payment_required',
    deadline_at = statement_timestamp() + interval '1 hour'
where id = (select id from security_payment);
update public.applications
set status = 'awaiting_payment'
where id = '11111111-aaaa-4aaa-8aaa-111111111111';
set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);

select pg_temp.expect_error(
  format(
    'select public.submit_adcb_payment_reference(%L, %L)',
    (select id from security_payment),
    'ATTACKER-REFERENCE'
  ),
  'PAYMENT_NOT_EDITABLE'
);

select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
```

## 6. Waiting-list state and input checks

The invitation fixture is currently `accepted`, so a join RPC must not reset
it:

```sql
select pg_temp.expect_error(
  $$select public.join_waiting_list(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '3x3m', 2000, 'aaaaaaaa-0000-4000-8000-000000000001'
  )$$,
  'WAITING_LIST_STATE_LOCKED'
);

reset role;
delete from public.waiting_list
where id = '11111111-cccc-4ccc-8ccc-111111111111';
update public.booths
set status = 'available',
    held_for_business_id = null,
    locked_by_business_id = null,
    lock_expires_at = null,
    current_application_id = null
where id = 'aaaaaaaa-1000-4000-8000-000000000001';
update public.applications
set status = 'approved',
    booth_id = null,
    booth_price_before_vat = null,
    vat_amount = null,
    total_amount = null
where id = '11111111-aaaa-4aaa-8aaa-111111111111';
update public.payments
set status = 'expired'
where id = (select id from security_payment);
set local role authenticated;

select pg_temp.expect_error(
  $$select public.join_waiting_list(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '3x3m', -1, null
  )$$,
  'INVALID_MAX_BUDGET'
);

select pg_temp.expect_error(
  $$select public.join_waiting_list(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '3x3m', 2000, 'bbbbbbbb-0000-4000-8000-000000000002'
  )$$,
  'ZONE_EVENT_MISMATCH'
);

select pg_temp.expect_error(
  $$select public.join_waiting_list(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    '3x3m', 2000, null
  )$$,
  'EVENT_NOT_OPEN'
);

select public.join_waiting_list(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '  3x3m  ',
  2000,
  'aaaaaaaa-0000-4000-8000-000000000001'
);

select pg_temp.assert_true(
  (
    select status = 'waiting'
       and preferred_booth_size = '3x3m'
       and max_budget = 2000
    from public.waiting_list
    where event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and business_id = '11111111-1111-4111-8111-111111111101'
  ),
  'valid waiting-list join must persist normalized preferences'
);

-- A second update preserves the original nonzero rank.
create temp table security_waiting_priority as
select priority as value
from public.waiting_list
where event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  and business_id = '11111111-1111-4111-8111-111111111101';

select public.join_waiting_list(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '4x4m',
  2500,
  'aaaaaaaa-0000-4000-8000-000000000001'
);

select pg_temp.assert_true(
  (
    select w.priority = p.value and w.priority > 0
    from public.waiting_list w
    cross join security_waiting_priority p
    where w.event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and w.business_id = '11111111-1111-4111-8111-111111111101'
  ),
  'waiting-list updates must preserve a nonzero priority'
);

-- A concurrent business receives the next deterministic rank.
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);
select public.join_waiting_list(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  null,
  null,
  null
);

select pg_temp.assert_true(
  (
    select pg_catalog.count(*) = 2
       and pg_catalog.count(distinct priority) = 2
       and pg_catalog.min(priority) > 0
    from public.waiting_list
    where event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and status = 'waiting'
  ),
  'new waiting-list entries must receive unique nonzero ranks'
);

-- Admin-only RPCs reject a normal vendor.
select pg_temp.expect_error(
  $$select public.reorder_waiting_list(
    (
      select id
      from public.waiting_list
      where event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
        and business_id = '22222222-2222-4222-8222-222222222202'
    ),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'down'
  )$$,
  'ADMIN_REQUIRED'
);

reset role;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values (
  '33333333-3333-4333-8333-333333333333',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'security-admin@example.invalid',
  crypt('not-a-real-login', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"admin","full_name":"Security Admin"}',
  now(), now()
);
update public.profiles
set role = 'admin'
where id = '33333333-3333-4333-8333-333333333333';

-- Ensure an invitation target is a clean available row.
update public.booths
set status = 'available',
    held_for_business_id = null,
    locked_by_business_id = null,
    lock_expires_at = null,
    current_application_id = null
where id = 'aaaaaaaa-1000-4000-8000-000000000003';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);

-- Vendor two was inserted after vendor one and starts above it. Move vendor
-- one up and verify the adjacent priorities swap atomically.
select public.reorder_waiting_list(
  (
    select id
    from public.waiting_list
    where event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and business_id = '11111111-1111-4111-8111-111111111101'
  ),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'up'
);

select pg_temp.assert_true(
  (
    select
      pg_catalog.max(priority) filter (
        where business_id = '11111111-1111-4111-8111-111111111101'
      )
      >
      pg_catalog.max(priority) filter (
        where business_id = '22222222-2222-4222-8222-222222222202'
      )
    from public.waiting_list
    where event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and status = 'waiting'
  ),
  'admin reorder must swap adjacent ranks'
);

select public.invite_from_waiting_list(
  (
    select id
    from public.waiting_list
    where event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and business_id = '11111111-1111-4111-8111-111111111101'
  ),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'aaaaaaaa-1000-4000-8000-000000000003'
);

select pg_temp.assert_true(
  (
    select w.status = 'invited'
       and w.invited_booth_id = b.id
       and w.invitation_expires_at between
         statement_timestamp() + interval '29 minutes 55 seconds'
         and statement_timestamp() + interval '30 minutes 5 seconds'
       and b.status = 'admin_held'
       and b.held_for_business_id = w.business_id
    from public.waiting_list w
    join public.booths b on b.id = w.invited_booth_id
    where w.event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and w.business_id = '11111111-1111-4111-8111-111111111101'
  ),
  'admin invitation must atomically hold the booth for 30 server minutes'
);

-- Admin payment changes are serialized, event-scoped, and validate the
-- payment/application/booth relationship before any row changes.
reset role;
update public.applications
set status = 'awaiting_payment',
    booth_id = 'aaaaaaaa-1000-4000-8000-000000000001',
    booth_price_before_vat = 1000,
    vat_amount = 50,
    total_amount = 1050,
    confirmed_at = null
where id = '11111111-aaaa-4aaa-8aaa-111111111111';

update public.booths
set status = 'awaiting_payment',
    held_for_business_id = null,
    locked_by_business_id = '11111111-1111-4111-8111-111111111101',
    lock_expires_at = null,
    current_application_id = '11111111-aaaa-4aaa-8aaa-111111111111'
where id = 'aaaaaaaa-1000-4000-8000-000000000001';

update public.payments
set status = 'payment_required',
    amount = 1050,
    deadline_at = statement_timestamp() - interval '1 minute',
    verified_by = null,
    verified_at = null,
    rejection_reason = null,
    refund_amount = null,
    notes = null
where id = (select id from security_payment);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);

select pg_temp.expect_error(
  format(
    'select public.admin_confirm_payment(%L, %L)',
    (select id from security_payment),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
  ),
  'PAYMENT_EVENT_MISMATCH'
);

select public.admin_extend_payment_deadline(
  (select id from security_payment),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  10
);

select pg_temp.assert_true(
  (
    select deadline_at between
      statement_timestamp() + interval '9 minutes 55 seconds'
      and statement_timestamp() + interval '10 minutes 5 seconds'
    from public.payments
    where id = (select id from security_payment)
  ),
  'deadline extension must use the locked server-side deadline'
);

select pg_temp.expect_error(
  format(
    'select public.admin_update_payment_link(%L, %L, %L)',
    (select id from security_payment),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'http://payments.example.invalid/not-https'
  ),
  'INVALID_PAYMENT_LINK'
);

select pg_temp.expect_error(
  format(
    'select public.admin_update_payment_link(%L, %L, %L)',
    (select id from security_payment),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'https://payments.example.invalid/cross-event'
  ),
  'PAYMENT_EVENT_MISMATCH'
);

select public.admin_update_payment_link(
  (select id from security_payment),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '  https://payments.example.invalid/security-payment  '
);

select public.admin_update_payment_note(
  (select id from security_payment),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '  Internal security note  '
);

select pg_temp.assert_true(
  (
    select payment_link = 'https://payments.example.invalid/security-payment'
       and method = 'adcb_pace_pay'
       and notes = 'Internal security note'
    from public.payments
    where id = (select id from security_payment)
  ),
  'payment metadata RPCs must trim and persist validated values'
);

reset role;
update public.payments
set status = 'pending_verification'
where id = (select id from security_payment);
update public.applications
set status = 'payment_under_review'
where id = '11111111-aaaa-4aaa-8aaa-111111111111';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);

select pg_temp.expect_error(
  format(
    'select public.admin_extend_payment_deadline(%L, %L, 10)',
    (select id from security_payment),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  'PAYMENT_STATE_CONFLICT'
);

select public.admin_confirm_payment(
  (select id from security_payment),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
);

select pg_temp.assert_true(
  (
    select p.status = 'paid'
       and p.verified_by = '33333333-3333-4333-8333-333333333333'
       and p.verified_at is not null
       and a.status = 'confirmed'
       and b.status = 'confirmed'
       and exists (
         select 1
         from public.booth_events e
         where e.booth_id = b.id
           and e.event_type = 'confirmed'
           and e.actor_id = '33333333-3333-4333-8333-333333333333'
           and e.details ->> 'source' = 'admin_payment_confirmation'
       )
    from public.payments p
    join public.applications a on a.id = p.application_id
    join public.booths b on b.id = a.booth_id
    where p.id = (select id from security_payment)
  ),
  'payment confirmation must atomically confirm all three records'
);

select pg_temp.expect_error(
  format(
    'select public.admin_refund_payment(%L, %L, 1050.01, null)',
    (select id from security_payment),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  'INVALID_REFUND_AMOUNT'
);

select pg_temp.expect_error(
  format(
    'select public.admin_refund_payment(%L, %L, 100.001, null)',
    (select id from security_payment),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  'INVALID_REFUND_AMOUNT'
);

select public.admin_refund_payment(
  (select id from security_payment),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  100,
  null
);

select pg_temp.assert_true(
  (
    select status = 'partially_refunded'
       and refund_amount = 100
       and notes = 'Internal security note'
    from public.payments
    where id = (select id from security_payment)
  ),
  'partial refund must preserve an existing note when no new note is supplied'
);

reset role;
update public.payments
set status = 'paid', refund_amount = null
where id = (select id from security_payment);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);

select public.admin_refund_payment(
  (select id from security_payment),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  1050,
  '  Full refund verified  '
);

select pg_temp.assert_true(
  (
    select status = 'refunded'
       and refund_amount = 1050
       and notes = 'Full refund verified'
    from public.payments
    where id = (select id from security_payment)
  ),
  'full refund must be derived from the stored payment amount'
);

reset role;
update public.payments
set status = 'pending_verification',
    deadline_at = statement_timestamp() - interval '1 minute',
    verified_by = null,
    verified_at = null,
    refund_amount = null
where id = (select id from security_payment);
update public.applications
set status = 'payment_under_review', confirmed_at = null
where id = '11111111-aaaa-4aaa-8aaa-111111111111';
update public.booths
set status = 'awaiting_payment'
where id = 'aaaaaaaa-1000-4000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);

select public.admin_reject_payment(
  (select id from security_payment),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '  Receipt is unreadable  '
);

select pg_temp.assert_true(
  (
    select p.status = 'payment_required'
       and p.rejection_reason = 'Receipt is unreadable'
       and p.deadline_at between
         statement_timestamp() + interval '59 minutes 55 seconds'
         and statement_timestamp() + interval '60 minutes 5 seconds'
       and a.status = 'awaiting_payment'
    from public.payments p
    join public.applications a on a.id = p.application_id
    where p.id = (select id from security_payment)
  ),
  'rejection must atomically restore a fresh server-derived deadline'
);

reset role;
update public.payments
set status = 'expired'
where id = (select id from security_payment);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);

select public.admin_reopen_payment(
  (select id from security_payment),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  30
);

select pg_temp.assert_true(
  (
    select p.status = 'payment_required'
       and p.amount = a.total_amount
       and p.deadline_at between
         statement_timestamp() + interval '29 minutes 55 seconds'
         and statement_timestamp() + interval '30 minutes 5 seconds'
       and a.status = 'awaiting_payment'
       and b.status = 'awaiting_payment'
    from public.payments p
    join public.applications a on a.id = p.application_id
    join public.booths b on b.id = a.booth_id
    where p.id = (select id from security_payment)
  ),
  'reopen must atomically restore payment, application, and booth state'
);

select public.admin_release_payment_booth(
  (select id from security_payment),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
);

select pg_temp.assert_true(
  (
    select p.status = 'expired'
       and a.status = 'approved'
       and a.booth_id is null
       and b.status = 'available'
       and b.current_application_id is null
       and b.locked_by_business_id is null
       and exists (
         select 1
         from public.booth_events e
         where e.booth_id = b.id
           and e.event_type = 'admin_released'
           and e.actor_id = '33333333-3333-4333-8333-333333333333'
           and e.details ->> 'source' = 'admin_payment_release'
       )
    from public.payments p
    join public.applications a on a.id = p.application_id
    cross join public.booths b
    where p.id = (select id from security_payment)
      and b.id = 'aaaaaaaa-1000-4000-8000-000000000001'
  ),
  'payment booth release must clean every linked row atomically'
);

select pg_temp.expect_error(
  format(
    'select public.admin_reopen_payment(%L, %L, 30)',
    (select id from security_payment),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  'APPLICATION_STATE_CONFLICT'
);

reset role;
update public.applications
set status = 'booth_selected',
    booth_id = 'aaaaaaaa-1000-4000-8000-000000000001',
    booth_price_before_vat = 1000,
    vat_amount = 50,
    total_amount = 1050,
    confirmed_at = null
where id = '11111111-aaaa-4aaa-8aaa-111111111111';
update public.booths
set status = 'locked',
    held_for_business_id = null,
    locked_by_business_id = '11111111-1111-4111-8111-111111111101',
    lock_expires_at = statement_timestamp() + interval '7 minutes',
    current_application_id = '11111111-aaaa-4aaa-8aaa-111111111111'
where id = 'aaaaaaaa-1000-4000-8000-000000000001';
update public.payments
set status = 'expired', verified_by = null, verified_at = null
where id = (select id from security_payment);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);

select pg_temp.expect_error(
  format(
    'select public.admin_record_offline_payment(%L, %L, 1050, null)',
    '11111111-aaaa-4aaa-8aaa-111111111111',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
  ),
  'PAYMENT_EVENT_MISMATCH'
);

select pg_temp.expect_error(
  format(
    'select public.admin_record_offline_payment(%L, %L, 1049, null)',
    '11111111-aaaa-4aaa-8aaa-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  'PAYMENT_AMOUNT_MISMATCH'
);

select public.admin_record_offline_payment(
  '11111111-aaaa-4aaa-8aaa-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  1050,
  '  Counter payment verified  '
);

select pg_temp.assert_true(
  (
    select p.status = 'paid'
       and p.method = 'offline'
       and p.amount = 1050
       and p.notes = 'Counter payment verified'
       and p.verified_by = '33333333-3333-4333-8333-333333333333'
       and a.status = 'confirmed'
       and b.status = 'confirmed'
    from public.payments p
    join public.applications a on a.id = p.application_id
    join public.booths b on b.id = a.booth_id
    where p.id = (select id from security_payment)
  ),
  'offline payment must atomically confirm payment, application, and booth'
);

select pg_temp.expect_error(
  format(
    'select public.admin_record_offline_payment(%L, %L, 1050, null)',
    '11111111-aaaa-4aaa-8aaa-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
  ),
  'PAYMENT_STATE_CONFLICT'
);

-- Admin booth assignment and release use the same business/event advisory
-- key as vendor booth flows and reject stale or paid states.
select pg_temp.expect_error(
  $$select public.admin_assign_booth(
    'aaaaaaaa-1000-4000-8000-000000000002',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    '22222222-aaaa-4aaa-8aaa-222222222222'
  )$$,
  'BOOTH_EVENT_MISMATCH'
);

select public.admin_assign_booth(
  'aaaaaaaa-1000-4000-8000-000000000002',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '22222222-aaaa-4aaa-8aaa-222222222222'
);

select pg_temp.assert_true(
  (
    select b.status = 'reserved'
       and b.current_application_id = a.id
       and b.locked_by_business_id = a.business_id
       and a.status = 'booth_selected'
       and a.booth_id = b.id
       and a.booth_price_before_vat = 1200
       and a.vat_amount = 60
       and a.total_amount = 1260
    from public.booths b
    join public.applications a on a.id = b.current_application_id
    where b.id = 'aaaaaaaa-1000-4000-8000-000000000002'
  ),
  'admin assignment must atomically reserve the booth and price the application'
);

create temp table security_admin_assignment_event_count as
select count(*)::int as value
from public.booth_events
where booth_id = 'aaaaaaaa-1000-4000-8000-000000000002'
  and event_type = 'reserved'
  and details ->> 'source' = 'admin_assignment';

-- A client retry is an idempotent read and must not duplicate history.
select public.admin_assign_booth(
  'aaaaaaaa-1000-4000-8000-000000000002',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '22222222-aaaa-4aaa-8aaa-222222222222'
);

select pg_temp.assert_true(
  (
    select count(*) = x.value
    from public.booth_events e
    cross join security_admin_assignment_event_count x
    where e.booth_id = 'aaaaaaaa-1000-4000-8000-000000000002'
      and e.event_type = 'reserved'
      and e.details ->> 'source' = 'admin_assignment'
    group by x.value
  ),
  'admin assignment retry must not duplicate booth history'
);

select pg_temp.expect_error(
  $$select public.admin_assign_booth(
    'aaaaaaaa-1000-4000-8000-000000000003',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '22222222-aaaa-4aaa-8aaa-222222222222'
  )$$,
  'APPLICATION_NOT_ELIGIBLE'
);

reset role;
insert into public.payments (
  application_id, method, status, amount, deadline_at
)
values (
  '22222222-aaaa-4aaa-8aaa-222222222222',
  null,
  'payment_required',
  1260,
  statement_timestamp() + interval '1 hour'
)
on conflict (application_id) do update
set method = excluded.method,
    status = excluded.status,
    amount = excluded.amount,
    deadline_at = excluded.deadline_at,
    verified_by = null,
    verified_at = null;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);

select pg_temp.expect_error(
  $$select public.admin_release_booth(
    'aaaaaaaa-1000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'must refund first'
  )$$,
  'BOOTH_PAYMENT_CONFLICT'
);

select pg_temp.expect_error(
  $$select public.admin_release_booth(
    'aaaaaaaa-1000-4000-8000-000000000002',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'wrong event'
  )$$,
  'BOOTH_EVENT_MISMATCH'
);

select public.admin_release_booth(
  'aaaaaaaa-1000-4000-8000-000000000002',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '  Admin reassignment requested  '
);

select pg_temp.assert_true(
  (
    select b.status = 'available'
       and b.current_application_id is null
       and b.locked_by_business_id is null
       and a.status = 'approved'
       and a.booth_id is null
       and p.status = 'expired'
       and exists (
         select 1
         from public.booth_events e
         where e.booth_id = b.id
           and e.event_type = 'admin_released'
           and e.actor_id = '33333333-3333-4333-8333-333333333333'
           and e.details ->> 'reason' = 'Admin reassignment requested'
           and e.details ->> 'source' = 'admin_booth_release'
       )
    from public.booths b
    cross join public.applications a
    join public.payments p on p.application_id = a.id
    where b.id = 'aaaaaaaa-1000-4000-8000-000000000002'
      and a.id = '22222222-aaaa-4aaa-8aaa-222222222222'
  ),
  'admin release must atomically clean the booth/application and expire payment'
);

select pg_temp.expect_error(
  $$select public.admin_release_booth(
    'aaaaaaaa-1000-4000-8000-000000000002',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'stale retry'
  )$$,
  'BOOTH_NOT_RELEASABLE'
);

-- Releasing an invitation-only hold also removes the stale invitation.
select public.admin_release_booth(
  'aaaaaaaa-1000-4000-8000-000000000003',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '  Invitation withdrawn  '
);

select pg_temp.assert_true(
  (
    select b.status = 'available'
       and b.held_for_business_id is null
       and w.status = 'removed'
       and w.invited_booth_id is null
       and w.invitation_expires_at is null
    from public.booths b
    join public.waiting_list w
      on w.event_id = b.event_id
     and w.business_id = '11111111-1111-4111-8111-111111111101'
    where b.id = 'aaaaaaaa-1000-4000-8000-000000000003'
  ),
  'releasing an admin hold must remove its invitation atomically'
);

-- Material profile edits require real reapproval, email is immutable, and
-- every newly supplied storage asset must resolve to this auth user's object.
reset role;
insert into public.categories (id, name, slug)
values (
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  'Security Category',
  'security-category'
);

insert into storage.objects (bucket_id, name)
values
(
  'business-logos',
  '11111111-1111-4111-8111-111111111111/security-logo.png'
),
(
  'trade-licenses',
  '11111111-1111-4111-8111-111111111111/security-license.pdf'
),
(
  'product-photos',
  '11111111-1111-4111-8111-111111111111/security-product.png'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select pg_temp.expect_error(
  $$select public.update_business_profile(
    'Security Business One',
    'Vendor One',
    'changed-email@example.invalid',
    '+971500000001',
    null,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    'A complete security test business description.',
    null,
    null,
    null
  )$$,
  'EMAIL_IMMUTABLE'
);

select pg_temp.expect_error(
  $$select public.update_business_profile(
    'Security Business One',
    'Vendor One',
    'security-business-1@example.invalid',
    '+971500000001',
    null,
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    'A complete security test business description.',
    'http://127.0.0.1:54321/storage/v1/object/public/business-logos/22222222-2222-4222-8222-222222222222/not-owned.png',
    null,
    null
  )$$,
  'LOGO_NOT_OWNED'
);

select public.update_business_profile(
  'Security Business One Updated',
  'Vendor One',
  'security-business-1@example.invalid',
  '+971500000009',
  'security.vendor',
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  'A complete security test business description.',
  'http://127.0.0.1:54321/storage/v1/object/public/business-logos/11111111-1111-4111-8111-111111111111/security-logo.png',
  '11111111-1111-4111-8111-111111111111/security-license.pdf',
  array[
    'http://127.0.0.1:54321/storage/v1/object/public/product-photos/11111111-1111-4111-8111-111111111111/security-product.png'
  ]
);

select pg_temp.assert_true(
  (
    select approval_status = 'pending_review'
       and requires_reapproval
       and email = 'security-business-1@example.invalid'
       and rejection_reason is null
    from public.businesses
    where id = '11111111-1111-4111-8111-111111111101'
  ),
  'material profile edit must immediately require admin review'
);

select pg_temp.expect_error(
  $$select public.lock_booth(
    'aaaaaaaa-1000-4000-8000-000000000002',
    7
  )$$,
  'BUSINESS_NOT_APPROVED'
);

select pg_temp.expect_error(
  $$select public.join_waiting_list(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    null,
    null,
    null
  )$$,
  'BUSINESS_NOT_APPROVED'
);

select pg_temp.expect_error(
  $$select public.apply_to_event(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
  )$$,
  'BUSINESS_NOT_APPROVED'
);

select pg_temp.expect_error(
  format(
    'select public.submit_adcb_payment_reference(%L, %L)',
    (select id from security_payment),
    'BLOCKED-WHILE-PENDING'
  ),
  'BUSINESS_NOT_APPROVED'
);

reset role;

-- NOT VALID constraints do not rewrite legacy rows, but do protect new writes.
select pg_temp.expect_error(
  $$update public.waiting_list
  set max_budget = -10
  where event_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    and business_id = '22222222-2222-4222-8222-222222222202'$$,
  'waiting_list_max_budget_nonnegative'
);

select pg_temp.expect_error(
  $$update public.events
  set setup_start_at = '2030-01-02T08:00:00Z',
      setup_end_at = '2030-01-01T08:00:00Z'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'$$,
  'events_setup_chronological_range'
);


reset role;
rollback;
```

New asset validation resolves the bucket object name from each supplied path or
public URL and requires an existing `storage.objects` row under `auth.uid()`.
Both `http` and `https` origins remain accepted for local Supabase and custom-domain
compatibility; the application CSP remains responsible for restricting which image
origins a browser may render.

All assertions should complete without an `ASSERTION FAILED` exception, and
the final `ROLLBACK` leaves no fixture data behind.

## 7. Pre-validation data audit

Before validating the new constraints in a later migration, run:

```sql
select id, booth_lock_minutes, payment_deadline_minutes
from public.events
where booth_lock_minutes not between 1 and 120
   or payment_deadline_minutes not between 5 and 10080;

select
  id,
  start_at,
  end_at,
  setup_start_at,
  setup_end_at,
  registration_opens_at,
  registration_closes_at
from public.events
where (start_at is not null and end_at is not null and start_at >= end_at)
   or (
     setup_start_at is not null
     and setup_end_at is not null
     and setup_start_at >= setup_end_at
   )
   or (
     registration_opens_at is not null
     and registration_closes_at is not null
     and registration_opens_at >= registration_closes_at
   );


select id, event_id, business_id, max_budget
from public.waiting_list
where max_budget is not null
  and (max_budget::text = 'NaN' or max_budget < 0);
```

Resolve every returned row intentionally before issuing `VALIDATE CONSTRAINT`.
