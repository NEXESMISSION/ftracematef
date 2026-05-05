-- =============================================================================
-- Trace Mate — durable trace-session rows + heartbeat reconciliation
-- =============================================================================
-- The previous duration-tracking flow trusted the client to compute "active
-- visible seconds" and POST it back via record_trace_session() on exit
-- (unmount or pagehide). That works fine when the user clicks End session,
-- but it loses sessions whenever the OS kills the tab/process before the
-- pagehide handler runs — common on mobile when the user swipes the app away
-- or the system reclaims memory. Those sessions silently vanish.
--
-- This migration moves the source of truth to the server:
--
--   1. trace_session_runs holds one row per tracing session, with
--      started_at + last_heartbeat_at + ended_at columns.
--   2. start_trace_run() opens a row.
--   3. heartbeat_trace_run() bumps last_heartbeat_at every ~30s while the
--      user is in the studio. Also stamps last_seen_at + current_page +
--      current_image_label on profiles so the admin dashboard knows the user
--      is live AND what they're tracing right now.
--   4. end_trace_run() closes the row cleanly (client End-session button or
--      pagehide keepalive).
--   5. reconcile_trace_runs() — server-side cleanup that closes any open
--      row whose heartbeat has been silent for more than the stale window.
--      Treats the last-known heartbeat as the end time so we still get an
--      accurate-ish duration even when the client disappeared without
--      saying goodbye. Called inline from the admin endpoint so the
--      dashboard always sees a clean state without needing a cron.
--
-- Idempotent — safe to re-run. Keeps the legacy start_trace_session() and
-- record_trace_session() functions in place; they're harmless if the new
-- client never calls them.
-- =============================================================================

create table if not exists public.trace_session_runs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  started_at          timestamptz not null default now(),
  last_heartbeat_at   timestamptz not null default now(),
  ended_at            timestamptz,
  duration_seconds    int,
  image_label         text,
  closed_reason       text  -- 'client_end' | 'unload' | 'reconciled'
);

-- "Most-recent runs per user" — the dashboard's drill-down needs this.
create index if not exists trace_session_runs_user_started_idx
  on public.trace_session_runs (user_id, started_at desc);

-- "Open rows that need reconciliation" — partial index keeps the scan tight
-- (well under a row even when the table grows).
create index if not exists trace_session_runs_open_idx
  on public.trace_session_runs (last_heartbeat_at)
  where ended_at is null;

alter table public.trace_session_runs enable row level security;

-- Self-read so a user can see their own session history if we ever expose
-- it in the UI. Writes go through security-definer RPCs only — no insert /
-- update / delete policies, intentionally.
drop policy if exists trace_session_runs_self_read on public.trace_session_runs;
create policy trace_session_runs_self_read
  on public.trace_session_runs
  for select
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Per-user reconciliation helper. Defined first so start_trace_run() (below)
-- can call it without ordering hazards. p_stale_seconds = 0 means "close ALL
-- open rows for this user" — what we want when they're explicitly opening
-- a fresh run.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.reconcile_trace_runs_for_user(
  p_user_id uuid,
  p_stale_seconds int default 120
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int := 0;
  v_added int := 0;
begin
  if p_user_id is null then
    return 0;
  end if;

  with closed as (
    update public.trace_session_runs r
       set ended_at         = r.last_heartbeat_at,
           duration_seconds = greatest(0, least(86400,
             extract(epoch from (r.last_heartbeat_at - r.started_at))::int
           )),
           closed_reason    = 'reconciled'
     where r.user_id = p_user_id
       and r.ended_at is null
       and r.last_heartbeat_at <= now() - make_interval(secs => p_stale_seconds)
    returning r.duration_seconds
  )
  select coalesce(sum(duration_seconds), 0), count(*) into v_added, v_total from closed;

  if v_added > 0 then
    update public.profiles
       set total_trace_seconds = total_trace_seconds + v_added
     where id = p_user_id;
  end if;

  return v_total;
end $$;

revoke all on function public.reconcile_trace_runs_for_user(uuid, int) from public;
-- No grants — internal helper for the security-definer functions below.

-- ─────────────────────────────────────────────────────────────────────────────
-- Global sweep. Called by the admin dashboard endpoint at the top of every
-- list-users read so the operator never sees zombie rows. Restricted to the
-- service role to keep ordinary clients from triggering full-table sweeps.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.reconcile_trace_runs(p_stale_seconds int default 120)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  with closed as (
    update public.trace_session_runs r
       set ended_at         = r.last_heartbeat_at,
           duration_seconds = greatest(0, least(86400,
             extract(epoch from (r.last_heartbeat_at - r.started_at))::int
           )),
           closed_reason    = 'reconciled'
     where r.ended_at is null
       and r.last_heartbeat_at <= now() - make_interval(secs => p_stale_seconds)
    returning r.user_id, r.duration_seconds
  ),
  per_user as (
    select user_id, sum(duration_seconds) as added
      from closed
     group by user_id
  ),
  bumped as (
    update public.profiles p
       set total_trace_seconds = p.total_trace_seconds + pu.added
      from per_user pu
     where p.id = pu.user_id
    returning 1
  )
  select count(*) into v_count from bumped;

  return v_count;
end $$;

revoke all on function public.reconcile_trace_runs(int) from public;
grant execute on function public.reconcile_trace_runs(int) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- start_trace_run — opens a new run, reconciles caller's stragglers first.
-- Returns the new row id so the client can use it for subsequent heartbeats.
-- Also bumps profiles.trace_sessions + first/last_trace_at, taking over the
-- role of start_trace_session() (which we leave in place for older clients).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.start_trace_run(p_image_label text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_id  uuid;
  v_label text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Trim + clamp the image label. We surface this on an admin dashboard so
  -- it's a quasi-trusted free-text field; cap the length defensively.
  v_label := nullif(trim(coalesce(p_image_label, '')), '');
  if v_label is not null and length(v_label) > 200 then
    v_label := left(v_label, 200);
  end if;

  -- Reconcile any of this user's prior open runs first. They may have
  -- crashed without a clean close on a previous session — credit the
  -- duration up to the last heartbeat and mark the row reconciled so the
  -- admin dashboard doesn't show a phantom "still tracing" row.
  perform public.reconcile_trace_runs_for_user(v_uid, 0);

  insert into public.trace_session_runs (user_id, image_label)
  values (v_uid, v_label)
  returning id into v_id;

  update public.profiles
     set trace_sessions = trace_sessions + 1,
         first_trace_at = coalesce(first_trace_at, v_now),
         last_trace_at  = v_now,
         last_seen_at   = v_now,
         current_page   = 'trace',
         current_image_label = v_label,
         current_run_id = v_id
   where id = v_uid;

  return v_id;
end $$;

revoke all on function public.start_trace_run(text) from public;
grant execute on function public.start_trace_run(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- heartbeat_trace_run — keep an open run alive + advertise live presence.
-- Bumps last_heartbeat_at on the run, AND stamps last_seen_at + current_page
-- 'trace' + current_image_label on profiles so a dashboard read sees both
-- "user is online" and "user is tracing X" in one query.
--
-- No-op (other than refreshing last_seen_at) if the run was already closed
-- — e.g. reconciled mid-flight in another transaction. The client doesn't
-- need to know.
-- ─────────────────────────────────────────────────────────────────────────────
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
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_run_id is null then
    return;
  end if;

  update public.trace_session_runs
     set last_heartbeat_at = v_now
   where id = p_run_id
     and user_id = v_uid
     and ended_at is null
   returning image_label into v_label;

  -- Mirror onto profiles so the admin dashboard's single-table read sees
  -- everything it needs. v_label may be null if the run was already closed
  -- (no row matched the UPDATE) — in that case we still bump last_seen_at
  -- but leave page/image alone, since this heartbeat is stale.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- end_trace_run — close a run cleanly. Idempotent: a second call is a no-op.
-- Computes duration server-side from started_at and the close time, adds it
-- to profiles.total_trace_seconds, and clears the user's "currently tracing"
-- presence so the admin dashboard stops showing them in the studio.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.end_trace_run(
  p_run_id uuid,
  p_reason text default 'client_end'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_dur int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_run_id is null then
    return;
  end if;

  -- Close the row only if it's still open. RETURNING gives us the duration
  -- so we can fold it into the user's total in the same transaction.
  update public.trace_session_runs
     set ended_at         = v_now,
         duration_seconds = greatest(0, least(86400, extract(epoch from (v_now - started_at))::int)),
         closed_reason    = case
           when p_reason in ('client_end','unload','reconciled') then p_reason
           else 'client_end'
         end
   where id = p_run_id
     and user_id = v_uid
     and ended_at is null
   returning duration_seconds into v_dur;

  if found and v_dur is not null and v_dur > 0 then
    update public.profiles
       set total_trace_seconds = total_trace_seconds + v_dur
     where id = v_uid;
  end if;

  -- Clear "currently tracing" presence regardless of whether the run was
  -- already closed — the user said they're done. Only clear if the active
  -- run id matches, so we don't stomp on a fresh run the user opened in a
  -- different tab between our client's End-session click and this RPC.
  update public.profiles
     set current_page        = case when current_page = 'trace' then null else current_page end,
         current_image_label = null,
         current_run_id      = null
   where id = v_uid
     and (current_run_id is null or current_run_id = p_run_id);
end $$;

revoke all on function public.end_trace_run(uuid, text) from public;
grant execute on function public.end_trace_run(uuid, text) to authenticated;
