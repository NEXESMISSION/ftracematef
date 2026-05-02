-- =============================================================================
-- Trace Mate — lower the recorded-session floor from 5s to 1s
-- =============================================================================
-- The original 0007_trace_stats migration mirrored the client's old
-- MIN_SESSION_SECONDS of 5. In practice this dropped the count of any quick
-- check-in (open the studio, glance at the camera, leave) — which left users
-- with the gate counter ticking past their visible "Sessions" stat after the
-- 5-session paywall hit. Drops to 1s here to match the new client floor.
--
-- Anything below 1s is still rejected so a routing glitch (mount + immediate
-- unmount with no real visit) can't inflate totals. Upper clamp at 24h is
-- unchanged.
--
-- Idempotent: `create or replace function` rewrites the body in place.
-- =============================================================================

create or replace function public.record_trace_session(duration_seconds int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_dur int  := duration_seconds;
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Drop sub-1s / non-positive durations silently. Matches the client's
  -- MIN_SESSION_SECONDS in lib/traceStats.js — the two must stay in sync.
  if v_dur is null or v_dur < 1 then
    return;
  end if;

  -- Clamp the upper end at 24h (laptop slept with the page open).
  if v_dur > 86400 then
    v_dur := 86400;
  end if;

  update public.profiles
     set total_trace_seconds = total_trace_seconds + v_dur,
         trace_sessions      = trace_sessions + 1,
         first_trace_at      = coalesce(first_trace_at, v_now),
         last_trace_at       = v_now
   where id = v_uid;
end $$;
