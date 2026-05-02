-- =============================================================================
-- Trace Mate — operator email notifications (signup + active user + digest)
-- =============================================================================
-- Wires the database to call the `notify-operator` Edge Function (which then
-- emails via Resend) for three events:
--
--   1. New profile created            → "signup"  trigger on profiles INSERT
--   2. Heartbeat after 4+ hours quiet → "active"  trigger on profiles UPDATE
--   3. Nightly digest (07:00 UTC)     → "digest"  pg_cron job
--
-- Why pg_net + Edge Function instead of Database Webhooks?
--   Database Webhooks live in the Supabase dashboard (no source control), and
--   their templating is too thin for our payloads. Doing this with pg_net keeps
--   the trigger logic versioned alongside the rest of the schema; the Edge
--   Function owns the Resend API key (so it never touches the database).
--
-- ── PREREQUISITES ───────────────────────────────────────────────────────────
-- Enable `pg_net` and `pg_cron` in the Supabase dashboard before applying
-- this migration:
--     Database → Extensions → enable `pg_net`
--     Database → Extensions → enable `pg_cron`
-- Both ship with Supabase but are off by default.
--
-- ── REQUIRED EDGE-FUNCTION SECRETS (set after deploy) ──────────────────────
--   RESEND_API_KEY     — Resend API key
--   RESEND_FROM        — Sender ("Trace Mate <onboarding@resend.dev>" works
--                        for testing; verified-domain sender for production)
--   OPERATOR_EMAIL     — Where to deliver the operator notifications
--   NOTIFY_FN_SECRET   — Shared secret matched against `x-notify-secret` on
--                        every request. Without it the function URL would be
--                        a free email-relay for anyone on the internet.
--
-- ── REQUIRED app_settings ROWS (set after deploy) ──────────────────────────
-- After deploying the function, run (replacing the placeholders) in the SQL
-- editor:
--     insert into public.app_settings (key, value) values
--       ('notify_fn_url',    'https://<project-ref>.supabase.co/functions/v1/notify-operator'),
--       ('notify_fn_secret', '<paste the same value as NOTIFY_FN_SECRET>');
--
-- Until those rows exist the triggers no-op silently — safe to apply this
-- migration well before configuring the function.
-- =============================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ── settings table ──────────────────────────────────────────────────────────
-- The trigger functions read URL + shared secret out of this table on every
-- fire, so the operator can rotate the secret or move the function URL
-- without touching the schema. Locked down with deny-all RLS — only the
-- service role / migrations write to it; the security-definer helper below
-- reads it on the trigger's behalf.
create table if not exists public.app_settings (
  key   text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
drop policy if exists "app_settings_deny_all" on public.app_settings;
create policy "app_settings_deny_all" on public.app_settings
  for all using (false) with check (false);
revoke all on public.app_settings from anon, authenticated;

-- ── debounce column for active-user notifications ──────────────────────────
-- `active_notified_at` records the last time we emailed the operator about
-- this user being in the app. Trigger uses it to enforce a 4-hour quiet
-- window — without it, every 60-second heartbeat would fire an email.
alter table public.profiles
  add column if not exists active_notified_at timestamptz;

-- Same lockdown as last_seen_at / free_trial_started_at — only writeable via
-- security-definer trigger; the broad self-update policy can't roll it back.
revoke update (active_notified_at) on public.profiles from authenticated, anon;

-- ── helper: read function URL + secret from app_settings ───────────────────
-- Returns NULL when not configured, so triggers no-op silently on fresh
-- deploys until the operator seeds the rows.
create or replace function public.notify_settings()
returns table (fn_url text, fn_secret text)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select value from public.app_settings where key = 'notify_fn_url')    as fn_url,
    (select value from public.app_settings where key = 'notify_fn_secret') as fn_secret;
$$;

revoke all on function public.notify_settings() from public;
-- Only the trigger functions (also security definer) need to read this — no
-- direct grants to authenticated/anon.

-- ── trigger: new profile → signup notification ─────────────────────────────
create or replace function public.tg_notify_signup()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_url    text;
  v_secret text;
begin
  select fn_url, fn_secret into v_url, v_secret from public.notify_settings();
  if v_url is null or v_url = '' then return new; end if;

  -- Fire-and-forget. pg_net queues the request; failures don't block the
  -- INSERT. Worst case: an email goes missing, and the daily digest still
  -- catches the signup the next morning.
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-notify-secret',  coalesce(v_secret, '')
    ),
    body    := jsonb_build_object(
      'event',        'signup',
      'profile_id',   new.id::text,
      'email',        new.email,
      'display_name', new.display_name,
      'created_at',   to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  );
  return new;
exception when others then
  -- Never let a notification failure block a signup. pg_net is fire-and-forget,
  -- but the perform itself can raise on misconfig (e.g. missing extension).
  raise warning '[tg_notify_signup] %', sqlerrm;
  return new;
end $$;

drop trigger if exists profiles_notify_signup on public.profiles;
create trigger profiles_notify_signup
  after insert on public.profiles
  for each row execute function public.tg_notify_signup();

-- ── trigger: active user → debounced notification ──────────────────────────
-- Fires when last_seen_at moves forward AND it's been 4+ hours since the
-- previous notification for this user. Net result: at most one "is in app"
-- email per user every 4 hours, even though the heartbeat runs every 60s.
--
-- Uses AFTER UPDATE OF last_seen_at so the trigger only evaluates when the
-- heartbeat actually changes the column — touch_last_seen() updates it
-- every minute, which is the only path that should fire this.
create or replace function public.tg_notify_active()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_url    text;
  v_secret text;
begin
  if new.last_seen_at is null then return new; end if;
  if old.last_seen_at is not null and new.last_seen_at = old.last_seen_at then
    return new;
  end if;

  -- Debounce: skip if we already notified within the last 4 hours.
  if new.active_notified_at is not null
     and new.last_seen_at - new.active_notified_at < interval '4 hours' then
    return new;
  end if;

  select fn_url, fn_secret into v_url, v_secret from public.notify_settings();
  if v_url is null or v_url = '' then return new; end if;

  -- Stamp the debounce BEFORE the HTTP fire so a concurrent heartbeat can't
  -- double-notify. AFTER UPDATE means we have to write a second UPDATE
  -- (BEFORE UPDATE could mutate `new` directly, but security-definer is
  -- happier in AFTER for a row that's already settled).
  update public.profiles
     set active_notified_at = new.last_seen_at
   where id = new.id;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',    'application/json',
      'x-notify-secret', coalesce(v_secret, '')
    ),
    body    := jsonb_build_object(
      'event',        'active',
      'profile_id',   new.id::text,
      'email',        new.email,
      'display_name', new.display_name,
      'last_seen_at', to_char(new.last_seen_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  );
  return new;
exception when others then
  raise warning '[tg_notify_active] %', sqlerrm;
  return new;
end $$;

drop trigger if exists profiles_notify_active on public.profiles;
create trigger profiles_notify_active
  after update of last_seen_at on public.profiles
  for each row execute function public.tg_notify_active();

-- ── daily digest ───────────────────────────────────────────────────────────
-- Summarizes the last 24 hours and pings the function. Schedule below.
create or replace function public.notify_daily_digest()
returns void
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_url     text;
  v_secret  text;
  v_signups int;
  v_active  int;
  v_paid    int;
begin
  select fn_url, fn_secret into v_url, v_secret from public.notify_settings();
  if v_url is null or v_url = '' then return; end if;

  select count(*) into v_signups
    from public.profiles
   where created_at >= now() - interval '24 hours';

  select count(*) into v_active
    from public.profiles
   where last_seen_at >= now() - interval '24 hours';

  select count(*) into v_paid
    from public.subscriptions
   where status = 'active' and plan <> 'free';

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',    'application/json',
      'x-notify-secret', coalesce(v_secret, '')
    ),
    body    := jsonb_build_object(
      'event',       'digest',
      'signups_24h', v_signups,
      'active_24h',  v_active,
      'paid_total',  v_paid
    )
  );
end $$;

revoke all on function public.notify_daily_digest() from public;

-- ── schedule the digest ────────────────────────────────────────────────────
-- 07:00 UTC every day. Wrapped in a do-block so a project without pg_cron
-- enabled (or with cron.schedule signature drift across pg versions) doesn't
-- abort the whole migration — the rest is still useful without the digest.
do $$
begin
  -- Idempotent: unschedule any previous run by name, then re-add.
  perform cron.unschedule('notify-daily-digest');
exception when others then
  null;  -- job didn't exist, fine
end $$;

do $$
begin
  perform cron.schedule(
    'notify-daily-digest',
    '0 7 * * *',
    $cron$ select public.notify_daily_digest(); $cron$
  );
exception when others then
  raise notice 'pg_cron schedule failed (continuing without daily digest): %', sqlerrm;
end $$;
