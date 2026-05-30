-- =============================================================================
-- TraceMate — personal test-account cleanup.
-- Paste each numbered block in Supabase → SQL Editor.
--   https://supabase.com/dashboard/project/gihmcbggfpogmisxvqyf/sql
--
-- Goal: delete only YOUR own test accounts, keep every real user.
--       The keeper is nexesmission@gmail.com.
--
-- Safety model: this script does NOT do "delete all except one" — that's
-- the kind of query that wipes a production DB on a typo. Instead, you fill
-- in an explicit allowlist of emails to remove, run a SHOW pass to confirm
-- it matches what you expect, then run the wrapped DELETE.
--
-- Run order:
--   1) LIST       — every account, sorted by activity, so you can identify
--                   your own test accounts.
--   2) PREVIEW    — paste your test-account emails into the array below
--                   and run; it shows exactly what would be deleted.
--   3) DELETE     — same array, wrapped in a transaction with a hard
--                   refuse-to-touch-the-keeper guard. Review then COMMIT.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1a) PROBABLE PERSONAL ACCOUNTS — narrow filter. Catches the patterns you
--     usually use: anything containing "saif", "founderplaybook" / "founder",
--     or starting with "hi" / "hi+" / "hi.". Copy the emails you want gone.
--
--     If a real customer happens to match (rare but possible), don't put
--     them in the delete list in block 2.
-- ─────────────────────────────────────────────────────────────────────────────
select
  case when u.email = 'nexesmission@gmail.com' then '✦ KEEPER' else '·' end as note,
  u.email,
  p.is_admin,
  s.plan,
  s.status,
  p.trace_sessions          as sessions,
  p.total_trace_seconds     as total_seconds,
  u.created_at,
  p.last_seen_at
from auth.users u
left join public.profiles      p on p.id      = u.id
left join public.subscriptions s on s.user_id = u.id and s.status = 'active'
where
       lower(u.email) like '%saif%'
    or lower(u.email) like '%founderplaybook%'
    or lower(u.email) like '%founder%'
    or lower(u.email) like 'hi@%'
    or lower(u.email) like 'hi.%'
    or lower(u.email) like 'hi+%'
order by u.created_at;


-- ─────────────────────────────────────────────────────────────────────────────
-- 1b) FULL LIST — every account, in case 1a missed something. Skim it and
--     spot any other test patterns you used (your other Gmail aliases,
--     +tag plus-addresses, work emails, etc.).
-- ─────────────────────────────────────────────────────────────────────────────
select
  case when u.email = 'nexesmission@gmail.com' then '✦ KEEPER' else '·' end as note,
  u.email,
  p.is_admin,
  s.plan,
  s.status,
  p.trace_sessions          as sessions,
  p.total_trace_seconds     as total_seconds,
  p.free_sessions_used,
  u.created_at,
  p.last_seen_at
from auth.users u
left join public.profiles      p on p.id      = u.id
left join public.subscriptions s on s.user_id = u.id and s.status = 'active'
order by u.created_at;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2) PREVIEW — fill in the array below with the emails you want to delete.
--    Running this block does NOT delete anything; it just shows what the
--    DELETE in block 3 would target. If the rows here aren't exactly your
--    test accounts, edit the array and re-run before block 3.
--
--    The keeper is hardcoded — even if it slips into the array by accident,
--    it will not appear in this preview (and block 3 will refuse).
-- ─────────────────────────────────────────────────────────────────────────────
with targets as (
  select unnest(array[
    -- 'old-test-1@gmail.com',
    -- 'old-test-2@gmail.com',
    -- ↑ paste your test-account emails here, comma-separated, lowercase
    NULL  -- placeholder so the array isn't empty when you first run; remove this line once you add real entries
  ]::text[]) as email
)
select
  case when u.email is null then '✗ NOT FOUND' else '✗ would delete' end as fate,
  t.email                   as listed_email,
  u.id                      as user_id,
  u.created_at,
  s.plan,
  p.trace_sessions
from targets t
left join auth.users u
       on lower(u.email) = lower(t.email)
      and lower(u.email) <> 'nexesmission@gmail.com'
left join public.profiles      p on p.id      = u.id
left join public.subscriptions s on s.user_id = u.id and s.status = 'active'
where t.email is not null
order by t.email;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3) DELETE — destructive. Same email list as block 2; KEEP THEM IN SYNC.
--    Wrapped in a transaction so you can review the deleted count and roll
--    back if anything looks off.
--
--    Cascades: profiles.id and subscriptions.user_id both reference
--    auth.users(id) ON DELETE CASCADE, so this single statement cleans up
--    profiles, subscriptions, trace_session_runs, payments, journey_events
--    for the listed users.
-- ─────────────────────────────────────────────────────────────────────────────
begin;

-- Defensive guard: this DELETE explicitly refuses to ever touch the keeper,
-- regardless of what's in the array.
with deleted as (
  delete from auth.users
  where lower(email) in (
    -- 'old-test-1@gmail.com',
    -- 'old-test-2@gmail.com',
    -- ↑ same emails as block 2 (lowercase)
    NULL
  )
    and lower(email) <> 'nexesmission@gmail.com'
  returning email
)
select count(*) as accounts_deleted, array_agg(email order by email) as emails
from deleted;

-- Review the row above. If correct:
--   commit;
-- If anything looks wrong:
--   rollback;
