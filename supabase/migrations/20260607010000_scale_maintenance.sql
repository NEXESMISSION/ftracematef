-- =============================================================================
-- Scalability: scheduled retention/maintenance + payment-idempotency backstop.
-- =============================================================================
-- The scalability audit (SCALABILITY_AUDIT.md) flagged that several tables grow
-- WITHOUT BOUND because nothing ever deletes from them:
--   * analytics_events — one row per click/scroll/rage/pageview for EVERY
--     visitor; prune_analytics() existed but was never cron-scheduled.
--   * rate_limits      — one row per (key × window) on the 30-60s heartbeat
--     path; never pruned.
--   * page_visits      — one row per route mount per signed-in user; the
--     migration that created it noted "a cleanup cron can prune later" — never added.
--   * webhook_events   — audit log, only ever read in short windows; never pruned.
-- Unbounded growth makes every rollup/autovacuum slower and fills disk. This
-- migration adds ONE nightly maintenance function + a single pg_cron job, and a
-- DB-level unique backstop on subscriptions.dodo_payment_id so a future writer
-- that forgets the advisory lock still can't double-insert a lifetime grant.
-- =============================================================================

-- ── Nightly maintenance: retention for the growth tables ─────────────────────
-- Retention windows chosen so nothing operationally useful is lost:
--   analytics_events  90d (via prune_analytics, which also prunes ip_geo >90d
--                     and anonymous visitors inactive >365d)
--   page_visits       90d (journey funnel only needs recent history)
--   rate_limits        1d (windows reset on use; rows older than a day are dead)
--   webhook_events    30d, AND only rows already processed=true — unprocessed /
--                     errored rows are KEPT for ops review regardless of age.
-- Idempotent and safe to run repeatedly. Returns the analytics rows deleted.
create or replace function public.run_nightly_maintenance()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_events_pruned int;
begin
  -- Analytics firehose + geo cache + stale anonymous visitors.
  v_events_pruned := public.prune_analytics(90);

  -- Per-navigation journey log.
  delete from public.page_visits
   where visited_at < now() - interval '90 days';

  -- Rate-limit buckets whose window is long closed.
  delete from public.rate_limits
   where window_started_at < now() - interval '1 day';

  -- Processed webhook audit rows past retention. Unprocessed/errored rows stay
  -- (they're the ones ops still needs to see), so this never hides a problem.
  delete from public.webhook_events
   where processed = true
     and processed_at is not null
     and processed_at < now() - interval '30 days';

  return v_events_pruned;
end $$;

revoke all    on function public.run_nightly_maintenance() from public, anon, authenticated;
grant execute on function public.run_nightly_maintenance() to service_role;

-- ── Schedule it ──────────────────────────────────────────────────────────────
-- 03:30 UTC daily (off-peak, clear of the 07:00 digest and 12:00 webhook alert).
-- Wrapped in do-blocks so a project without pg_cron still applies the rest.
do $$
begin
  perform cron.unschedule('nightly-maintenance');
exception when others then
  null;
end $$;

do $$
begin
  perform cron.schedule(
    'nightly-maintenance',
    '30 3 * * *',
    $cron$ select public.run_nightly_maintenance(); $cron$
  );
exception when others then
  raise notice 'pg_cron schedule failed (continuing without nightly maintenance): %', sqlerrm;
end $$;

-- ── Payment idempotency backstop ─────────────────────────────────────────────
-- grant_lifetime_subscription dedupes on payment_id under an advisory lock, but
-- there was only a NON-unique index on dodo_payment_id — no DB-level guarantee.
-- Replace it with a UNIQUE partial index so a duplicate lifetime grant is
-- physically impossible even if a future code path forgets the lock. Partial
-- (WHERE not null) because recurring-plan rows legitimately have null here, and
-- every real lookup is by a concrete (non-null) payment id.
drop index if exists public.subscriptions_dodo_payment_id_idx;
create unique index if not exists subscriptions_dodo_payment_id_uniq
  on public.subscriptions (dodo_payment_id)
  where dodo_payment_id is not null;
