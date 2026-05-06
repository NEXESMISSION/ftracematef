-- =============================================================================
-- Trace Mate — rate-limit hot RPCs (anti-abuse, anti-cost-amplification)
-- =============================================================================
-- Threat: a hostile (or just buggy) signed-in client can call any of our
-- security-definer RPCs as fast as the network allows. The legit usage
-- pattern is e.g. `heartbeat_trace_run` once every 30s. A loop of
-- `for (let i=0; i<100000; i++) fetch('/rpc/heartbeat_trace_run', ...)`
-- would:
--   - hammer the DB with row-level UPDATEs
--   - inflate Supabase egress + DB CPU cost
--   - (depending on the RPC) inflate the user's own vanity stats
-- Supabase's edge-level rate limit catches this eventually but not before
-- damage is done. We have a per-user `check_rate_limit(bucket, max, window)`
-- helper from the init migration; this migration plugs it into the four hot
-- RPCs that didn't have it.
--
-- Caps were chosen to be 5-10x the legit cadence:
--   start_trace_run     →  30 / hour      (legit: a few per day)
--   heartbeat_trace_run → 200 / minute    (legit: 1 per 30s = 2/min)
--   record_trace_session→  10 / hour      (legacy, low usage)
--   touch_last_seen     → 200 / minute    (legit: 1 per 60s = 1/min)
--
-- Over the cap → silent no-op (return current state) rather than raise.
-- Throwing would surface in the user's tab as a console error and create
-- visible noise; a no-op simply degrades gracefully — heartbeats stop
-- registering momentarily, life goes on. The damage we're blocking is
-- DB load, not data integrity.
--
-- consume_free_session() is already self-capping (atomic `< 2` check),
-- doesn't need a rate limit.
--
-- Idempotent — CREATE OR REPLACE swaps function bodies; permissions and
-- grants from the prior migrations are preserved.
-- =============================================================================

-- ── start_trace_run ─────────────────────────────────────────────────────────
-- Wraps the existing function. Drop+recreate because we keep the jsonb
-- return type from migration 7 (CREATE OR REPLACE can't change return).
drop function if exists public.start_trace_run(text);

create function public.start_trace_run(p_image_label text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_now   timestamptz := now();
  v_id    uuid;
  v_token uuid;
  v_label text;
  v_ok    boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Cap: 30 starts/hour per user. A determined spammer can't repeatedly
  -- inflate trace_sessions or churn through DB writes.
  select public.check_rate_limit(
    'start_trace_run:' || v_uid::text,
    30,
    3600
  ) into v_ok;
  if v_ok = false then
    -- Return null fields rather than raising — the client treats this
    -- as a session that didn't open (no run id, no token). Subsequent
    -- heartbeats no-op; reconciler stays clean.
    return jsonb_build_object('run_id', null, 'spectate_token', null);
  end if;

  v_label := nullif(trim(coalesce(p_image_label, '')), '');
  if v_label is not null and length(v_label) > 200 then
    v_label := left(v_label, 200);
  end if;

  perform public.reconcile_trace_runs_for_user(v_uid, 0);

  insert into public.trace_session_runs (user_id, image_label)
  values (v_uid, v_label)
  returning id, spectate_token into v_id, v_token;

  update public.profiles
     set trace_sessions = trace_sessions + 1,
         first_trace_at = coalesce(first_trace_at, v_now),
         last_trace_at  = v_now,
         last_seen_at   = v_now,
         current_page   = 'trace',
         current_image_label = v_label,
         current_run_id = v_id
   where id = v_uid;

  return jsonb_build_object('run_id', v_id, 'spectate_token', v_token);
end $$;

revoke all on function public.start_trace_run(text) from public;
grant execute on function public.start_trace_run(text) to authenticated;

-- ── heartbeat_trace_run ─────────────────────────────────────────────────────
create or replace function public.heartbeat_trace_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_label text;
  v_ok    boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_run_id is null then
    return;
  end if;

  -- Cap: 200/minute per user. Legit cadence is 1 per 30s.
  select public.check_rate_limit(
    'heartbeat_trace_run:' || v_uid::text,
    200,
    60
  ) into v_ok;
  if v_ok = false then
    return;
  end if;

  update public.trace_session_runs
     set last_heartbeat_at = v_now
   where id = p_run_id
     and user_id = v_uid
     and ended_at is null
   returning image_label into v_label;

  if found then
    update public.profiles
       set last_seen_at        = v_now,
           current_page        = 'trace',
           current_image_label = v_label,
           current_run_id      = p_run_id
     where id = v_uid;
  else
    update public.profiles
       set last_seen_at = v_now
     where id = v_uid;
  end if;
end $$;

revoke all on function public.heartbeat_trace_run(uuid) from public;
grant execute on function public.heartbeat_trace_run(uuid) to authenticated;

-- ── record_trace_session (legacy, low-usage) ────────────────────────────────
create or replace function public.record_trace_session(duration_seconds int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_dur int  := duration_seconds;
  v_ok  boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Cap: 10/hour per user. Legacy RPC; new client uses end_trace_run.
  select public.check_rate_limit(
    'record_trace_session:' || v_uid::text,
    10,
    3600
  ) into v_ok;
  if v_ok = false then
    return;
  end if;

  if v_dur is null or v_dur < 1 then
    return;
  end if;
  if v_dur > 86400 then
    v_dur := 86400;
  end if;

  update public.profiles
     set total_trace_seconds = total_trace_seconds + v_dur
   where id = v_uid;
end $$;

-- ── touch_last_seen ─────────────────────────────────────────────────────────
create or replace function public.touch_last_seen(
  p_page  text default null,
  p_image text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_now   timestamptz := now();
  v_page  text;
  v_image text;
  v_ok    boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Cap: 200/minute per user. Legit cadence is 1 per 60s, plus an
  -- extra ping on each route change.
  select public.check_rate_limit(
    'touch_last_seen:' || v_uid::text,
    200,
    60
  ) into v_ok;
  if v_ok = false then
    -- Return now() so the client doesn't think the call failed; nothing
    -- changes server-side this tick.
    return v_now;
  end if;

  v_page  := case
    when p_page is null     then null
    when length(p_page)  > 64  then left(p_page,  64)
    else p_page
  end;
  v_image := case
    when p_image is null    then null
    when length(p_image) > 200 then left(p_image, 200)
    else p_image
  end;

  update public.profiles
     set last_seen_at = v_now,
         current_page = case
           when p_page is null      then current_page
           when v_page = ''         then null
           else v_page
         end,
         current_image_label = case
           when p_image is null     then current_image_label
           when v_image = ''        then null
           else v_image
         end
   where id = v_uid;

  return v_now;
end $$;

revoke all on function public.touch_last_seen(text, text) from public;
grant execute on function public.touch_last_seen(text, text) to authenticated;
