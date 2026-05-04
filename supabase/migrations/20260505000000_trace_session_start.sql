-- =============================================================================
-- Trace Mate — split session-count accounting from duration accounting
-- =============================================================================
-- Until now `record_trace_session(duration_seconds)` did both jobs: it
-- incremented `trace_sessions` AND added to `total_trace_seconds`, gated on
-- duration ≥ 1s. The side-effect was that a user who opened the trace studio
-- but did not actively work for at least a second never got the session
-- credited, even though the studio was opened. The product treats opening
-- the studio with an image as the "session" — the duration is a separate
-- engagement signal.
--
-- This migration:
--   1. Adds `start_trace_session()` — bumps `trace_sessions` and stamps
--      first/last_trace_at the moment the studio opens. No duration. Idempotent
--      across re-mounts is the client's job (it guards via a ref).
--   2. Rewrites `record_trace_session(duration_seconds)` to only accumulate
--      `total_trace_seconds`. It no longer touches the count or the timestamps.
--      Older clients that still call it will keep working — they just won't
--      bump the count from this RPC anymore. Once they update they get the
--      new behaviour for free.
--
-- Idempotent — safe to re-run.
-- =============================================================================

create or replace function public.start_trace_session()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
     set trace_sessions = trace_sessions + 1,
         first_trace_at = coalesce(first_trace_at, v_now),
         last_trace_at  = v_now
   where id = v_uid;
end $$;

revoke all on function public.start_trace_session() from public;
grant execute on function public.start_trace_session() to authenticated;

create or replace function public.record_trace_session(duration_seconds int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_dur int  := duration_seconds;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Drop sub-1s / non-positive durations silently. The client also guards;
  -- this is belt-and-braces so a routing glitch can't add a 0s duration.
  if v_dur is null or v_dur < 1 then
    return;
  end if;

  -- Clamp the upper end at 24h (laptop slept with the page open).
  if v_dur > 86400 then
    v_dur := 86400;
  end if;

  -- Duration only — count + timestamps live in start_trace_session().
  update public.profiles
     set total_trace_seconds = total_trace_seconds + v_dur
   where id = v_uid;
end $$;
