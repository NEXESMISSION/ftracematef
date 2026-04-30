-- =============================================================================
-- Trace Mate — database verification script
-- Run in Supabase SQL Editor. Each block returns a single PASS/FAIL row so you
-- can scan the output. Read-only — safe to run anytime.
-- =============================================================================

-- ── 1. Extensions ────────────────────────────────────────────────────────────
select
  case when exists (select 1 from pg_extension where extname = 'uuid-ossp')
       then 'PASS: uuid-ossp installed'
       else 'FAIL: uuid-ossp missing — run: create extension "uuid-ossp"' end
  as check_uuid_ossp;

-- ── 2. Enum types ────────────────────────────────────────────────────────────
select
  case when (select count(*) from pg_type where typname = 'subscription_plan') = 1
       then 'PASS: enum subscription_plan exists'
       else 'FAIL: enum subscription_plan missing' end as check_enum_plan;

select string_agg(enumlabel, ', ' order by enumsortorder)
  as subscription_plan_values
from pg_enum where enumtypid = 'subscription_plan'::regtype;
-- Expected: free, monthly, quarterly, lifetime

select string_agg(enumlabel, ', ' order by enumsortorder)
  as subscription_status_values
from pg_enum where enumtypid = 'subscription_status'::regtype;
-- Expected: active, on_hold, cancelled, expired, failed

-- ── 3. Tables exist ──────────────────────────────────────────────────────────
select
  case when to_regclass('public.profiles')        is not null
        and to_regclass('public.subscriptions')   is not null
        and to_regclass('public.webhook_events')  is not null
       then 'PASS: profiles, subscriptions, webhook_events all exist'
       else 'FAIL: one or more tables missing' end as check_tables;

-- ── 4. Required columns exist ────────────────────────────────────────────────
with required (table_name, column_name) as (values
  ('profiles', 'id'), ('profiles', 'email'), ('profiles', 'display_name'),
  ('profiles', 'avatar_url'), ('profiles', 'dodo_customer_id'),
  ('profiles', 'free_trial_started_at'),
  ('profiles', 'created_at'), ('profiles', 'updated_at'),
  ('subscriptions', 'id'), ('subscriptions', 'user_id'),
  ('subscriptions', 'plan'), ('subscriptions', 'status'),
  ('subscriptions', 'current_period_end'),
  ('subscriptions', 'cancel_at_next_billing_date'),
  ('subscriptions', 'dodo_subscription_id'),
  ('subscriptions', 'dodo_payment_id'),
  ('subscriptions', 'amount_cents'), ('subscriptions', 'currency'),
  ('subscriptions', 'cancelled_at'),
  ('subscriptions', 'created_at'), ('subscriptions', 'updated_at'),
  ('webhook_events', 'id'), ('webhook_events', 'webhook_id'),
  ('webhook_events', 'event_type'), ('webhook_events', 'payload'),
  ('webhook_events', 'processed'), ('webhook_events', 'error_message'),
  ('webhook_events', 'attempts'),
  ('webhook_events', 'created_at'), ('webhook_events', 'processed_at')
)
select r.table_name, r.column_name,
  case when c.column_name is null then 'FAIL: missing' else 'PASS' end as status
from required r
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = r.table_name and c.column_name = r.column_name
order by r.table_name, r.column_name;

-- ── 5. RLS enabled ───────────────────────────────────────────────────────────
select tablename,
  case when rowsecurity then 'PASS: RLS enabled' else 'FAIL: RLS DISABLED' end as rls_status
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'subscriptions', 'webhook_events')
order by tablename;

-- ── 6. RLS policies exist ────────────────────────────────────────────────────
select tablename, policyname,
  case when policyname is not null then 'PASS' else 'FAIL' end as status
from pg_policies
where schemaname = 'public'
  and policyname in (
    'profiles_self_select', 'profiles_self_update', 'subscriptions_self_select'
  )
order by tablename, policyname;
-- Expect 3 rows.

-- ── 7. Triggers exist ────────────────────────────────────────────────────────
select tgname,
  case when tgname is not null then 'PASS' else 'FAIL' end as status
from pg_trigger
where tgname in (
  'on_auth_user_created',
  'profiles_set_updated_at',
  'subscriptions_set_updated_at'
)
order by tgname;
-- Expect 3 rows. on_auth_user_created lives on auth.users.

-- ── 8. Functions exist ───────────────────────────────────────────────────────
select proname,
  case when proname is not null then 'PASS' else 'FAIL' end as status
from pg_proc
where proname in (
    'handle_new_user', 'tg_set_updated_at', 'lifetime_seats_left',
    'start_free_trial_if_unused'
  )
  and pronamespace = 'public'::regnamespace
order by proname;
-- Expect 4 rows.

-- ── 9. Indexes exist ─────────────────────────────────────────────────────────
select indexname,
  case when indexname is not null then 'PASS' else 'FAIL' end as status
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'profiles_dodo_customer_id_idx',
    'subscriptions_user_id_idx',
    'subscriptions_status_idx',
    'subscriptions_dodo_sub_id_idx',
    'subscriptions_one_active_per_user',
    'webhook_events_processed_idx',
    'webhook_events_event_type_idx'
  )
order by indexname;
-- Expect 7 rows.

-- ── 10. webhook_events.webhook_id is UNIQUE (idempotency depends on it) ──────
select
  case when exists (
    select 1 from pg_constraint
    where conrelid = 'public.webhook_events'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%webhook_id%'
  )
  then 'PASS: webhook_events.webhook_id is UNIQUE'
  else 'FAIL: webhook_id not unique — webhook idempotency will not work' end
  as check_webhook_unique;

-- ── 11. Partial unique on subscriptions (one active per user) ────────────────
select
  case when exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'subscriptions_one_active_per_user'
      and indexdef ilike '%where%status%active%'
  )
  then 'PASS: only one active subscription allowed per user'
  else 'FAIL: missing partial unique index — duplicate active rows possible' end
  as check_one_active;

-- ── 12. Realtime publication includes subscriptions table ────────────────────
select
  case when exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'subscriptions'
  )
  then 'PASS: subscriptions in supabase_realtime'
  else 'FAIL: subscriptions NOT in realtime publication — Account page will not auto-refresh after webhook' end
  as check_realtime;

-- ── 13. lifetime_seats_left() callable + correct value ───────────────────────
select 'lifetime_seats_left() = ' || public.lifetime_seats_left()::text
  as check_lifetime_seats;
-- Expected: 0..10. Subtract count of active lifetime rows from 10.

-- ── 14. Spot-check: every auth.users row has a profile + subscription ────────
select
  (select count(*) from auth.users)                            as users,
  (select count(*) from public.profiles)                       as profiles,
  (select count(*) from public.subscriptions)                  as subscriptions,
  (select count(*) from public.subscriptions where status = 'active') as active_subs;
-- profiles should equal users; active_subs should equal users (one per).

-- ── 15. Find users missing a profile or active subscription (drift check) ────
select u.id, u.email,
  case when p.id is null then 'NO PROFILE' end as profile_missing,
  case when s.id is null then 'NO ACTIVE SUB' end as sub_missing
from auth.users u
left join public.profiles p on p.id = u.id
left join public.subscriptions s on s.user_id = u.id and s.status = 'active'
where p.id is null or s.id is null;
-- Expected: zero rows. If you see any, the on_auth_user_created trigger
-- didn't fire for them — re-run the trigger creation block from the migration.
