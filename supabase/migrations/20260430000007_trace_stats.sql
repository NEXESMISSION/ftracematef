-- =============================================================================
-- Trace Mate — server-side trace stats (admin visibility)
-- =============================================================================
-- Mirrors the four numbers shown on the user's own /account "scrapbook"
-- (Time traced, Sessions, Last session, Member since) into the database so
-- the operator dashboard can see them per user.
--
-- Until now those stats lived only in the user's localStorage on the device
-- they were tracing on — invisible to anyone but that user, and lost if
-- they switched devices or cleared storage. The client still writes
-- localStorage (fast, no network hop on the Account page); this migration
-- adds a parallel server-side cumulative across all devices.
--
-- Schema:
--   profiles.total_trace_seconds  bigint  default 0  — cumulative seconds
--   profiles.trace_sessions       int     default 0  — count of sessions ≥ 5s
--   profiles.first_trace_at       timestamptz null   — first qualifying session
--   profiles.last_trace_at        timestamptz null   — most recent
--
-- Why an RPC instead of a direct UPDATE?
--   The existing `profiles_self_update` policy lets users self-update any
--   column on their own row, so a malicious client could simply zero these
--   out — or set first/last to anything they please. The RPC is the only
--   sanctioned write path: it always uses now() for last_trace_at, monotonic-
--   ally increments the counters, and clamps duration to a sane range so a
--   bad actor can't inflate their totals to absurd values.
--
-- Idempotent so it can be re-run.
-- =============================================================================

alter table public.profiles
  add column if not exists total_trace_seconds bigint      not null default 0,
  add column if not exists trace_sessions      int         not null default 0,
  add column if not exists first_trace_at      timestamptz,
  add column if not exists last_trace_at       timestamptz;

-- Useful for "freshest tracers first" admin scans.
create index if not exists profiles_last_trace_at_idx
  on public.profiles (last_trace_at desc nulls last);

-- Belt-and-braces: stop direct UPDATEs from rewriting these columns. The
-- self-update policy is broad (anything-goes on your own row), so we forbid
-- the specific columns at the GRANT level. Service role still has full
-- access; the RPC below uses security definer to write them. Same treatment
-- as last_seen_at and free_trial_started_at.
revoke update (total_trace_seconds, trace_sessions, first_trace_at, last_trace_at)
  on public.profiles from authenticated, anon;

-- Sessions shorter than this are dropped — matches the client's MIN_SESSION_SECONDS
-- in lib/traceStats.js. Sessions longer than the upper cap are clamped — a
-- single trace lasting more than a day is almost certainly a stuck timer
-- (laptop slept with the page open), not a real tracing run, and we don't
-- want one bug to permanently distort the totals.
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

  -- Drop too-short / non-positive durations silently. The client also
  -- checks (MIN_SESSION_SECONDS = 5) but a user could call the RPC
  -- directly; either way, no row should record a 0-second session.
  if v_dur is null or v_dur < 5 then
    return;
  end if;

  -- Clamp the upper end at 24h. See note above.
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

revoke all on function public.record_trace_session(int) from public;
grant execute on function public.record_trace_session(int) to authenticated;
