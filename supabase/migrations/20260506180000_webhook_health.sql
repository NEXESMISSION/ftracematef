-- =============================================================================
-- Trace Mate — operator visibility for stuck webhook events
-- =============================================================================
-- A webhook event lands in public.webhook_events with processed=false. The
-- handler runs, throws, the row stays unprocessed, Dodo retries on its own
-- schedule. Eventually Dodo gives up retrying. If the underlying cause is
-- a config bug, the row sits there forever and the only signal is a
-- customer email (we just lived through this with EUR currency floors).
--
-- Two pieces here:
--
--   1. get_webhook_health() — admin RPC that returns counts + the most
--      recent stuck rows. Surfaced on the admin dashboard so the operator
--      sees a red badge whenever anything is stuck. Service-role only.
--
--   2. notify_stuck_webhooks() — a pg_cron-triggered function that emails
--      the operator (via the existing notify-operator Edge Function) when
--      any row has been stuck for more than 24 hours. 24h gives Dodo's
--      retry storm time to clear; anything still stuck past that is a
--      genuine config bug we need eyes on.
--
-- Idempotent: every CREATE is OR REPLACE / IF NOT EXISTS.
-- =============================================================================

-- ── Per-event health rollup ────────────────────────────────────────────────
-- Returns:
--   stuck_count            — total processed=false rows in the last 14 days
--   stuck_24h_count        — subset that are older than 24h (the alert tier)
--   oldest_stuck_age_secs  — how long the oldest stuck row has been sitting
--   recent                 — array of up to 20 stuck rows, newest first,
--                            with the fields the admin UI needs to render
--                            them and a sub_id/payment_id summary so the
--                            operator can grep the Dodo dashboard
create or replace function public.get_webhook_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count        int;
  v_24h_count    int;
  v_oldest_secs  int;
  v_recent       jsonb;
begin
  -- Count + age rollup. Bound to 14d so a years-old stuck row from a
  -- forgotten incident doesn't dominate the metric forever.
  select
    count(*) filter (where created_at > now() - interval '14 days'),
    count(*) filter (
      where created_at > now() - interval '14 days'
        and created_at < now() - interval '24 hours'
    ),
    coalesce(extract(epoch from now() - min(created_at) filter (
      where created_at > now() - interval '14 days'
    ))::int, 0)
    into v_count, v_24h_count, v_oldest_secs
    from public.webhook_events
   where processed = false;

  -- Latest 20 stuck rows for the dashboard list. Strip the full payload —
  -- pluck only the bits the UI shows, so we don't ship raw card data.
  select coalesce(jsonb_agg(row order by created_at desc), '[]'::jsonb)
    into v_recent
    from (
      select jsonb_build_object(
        'webhook_id',     webhook_id,
        'event_type',     event_type,
        'attempts',       attempts,
        'error_message',  error_message,
        'created_at',     created_at,
        'subscription_id', payload->'data'->>'subscription_id',
        'payment_id',     payload->'data'->>'payment_id',
        'currency',       payload->'data'->>'currency',
        'amount',         payload->'data'->'recurring_pre_tax_amount',
        'customer_email', payload->'data'->'customer'->>'email'
      ) as row, created_at
        from public.webhook_events
       where processed = false
         and created_at > now() - interval '14 days'
       order by created_at desc
       limit 20
    ) z;

  return jsonb_build_object(
    'stuck_count',           v_count,
    'stuck_24h_count',       v_24h_count,
    'oldest_stuck_age_secs', v_oldest_secs,
    'recent',                v_recent,
    'computed_at',           now()
  );
end $$;

revoke all on function public.get_webhook_health() from public;
grant execute on function public.get_webhook_health() to service_role;

-- ── Daily alert ───────────────────────────────────────────────────────────
-- Counts rows stuck > 24h. If > 0, fires the same notify-operator function
-- the signup/digest emails use, with a bespoke event type. The function
-- already gates on x-notify-secret + RESEND_API_KEY, so this re-uses every
-- existing security check.
--
-- Idempotent across runs (no debounce of its own — pg_cron schedule is the
-- debounce). If you want quieter, lower the schedule frequency below.
create or replace function public.notify_stuck_webhooks()
returns void
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_url     text;
  v_secret  text;
  v_count   int;
  v_oldest  int;
  v_sample  jsonb;
begin
  select fn_url, fn_secret into v_url, v_secret from public.notify_settings();
  if v_url is null or v_url = '' then return; end if;

  select count(*),
         coalesce(extract(epoch from now() - min(created_at))::int, 0)
    into v_count, v_oldest
    from public.webhook_events
   where processed = false
     and created_at < now() - interval '24 hours'
     and created_at > now() - interval '14 days';

  if v_count = 0 then return; end if;

  -- Pluck the 5 oldest examples to include in the email so the operator
  -- has something concrete to act on without needing to log in first.
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_type',    event_type,
    'attempts',      attempts,
    'error_message', error_message,
    'created_at',    created_at
  ) order by created_at asc), '[]'::jsonb)
    into v_sample
    from (
      select event_type, attempts, error_message, created_at
        from public.webhook_events
       where processed = false
         and created_at < now() - interval '24 hours'
         and created_at > now() - interval '14 days'
       order by created_at asc
       limit 5
    ) z;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',    'application/json',
      'x-notify-secret', coalesce(v_secret, '')
    ),
    body    := jsonb_build_object(
      'event',           'stuck_webhooks',
      'stuck_count',     v_count,
      'oldest_age_secs', v_oldest,
      'sample',          v_sample
    )
  );
exception when others then
  raise warning '[notify_stuck_webhooks] %', sqlerrm;
end $$;

revoke all on function public.notify_stuck_webhooks() from public;

-- ── Schedule the alert ────────────────────────────────────────────────────
-- 12:00 UTC every day. Wrapped in do-blocks so a project without pg_cron
-- enabled doesn't abort the migration — the rest is still useful without
-- the daily nag, since the dashboard panel reads the data live.
do $$
begin
  perform cron.unschedule('notify-stuck-webhooks');
exception when others then
  null;
end $$;

do $$
begin
  perform cron.schedule(
    'notify-stuck-webhooks',
    '0 12 * * *',
    $cron$ select public.notify_stuck_webhooks(); $cron$
  );
exception when others then
  raise notice 'pg_cron schedule failed (continuing without daily stuck-webhook alert): %', sqlerrm;
end $$;
