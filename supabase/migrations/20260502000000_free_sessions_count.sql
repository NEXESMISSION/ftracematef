-- =============================================================================
-- Trace Mate — expand the one-shot free trial into a 5-session counter
-- =============================================================================
-- Adds `profiles.free_sessions_used` (int, default 0) plus a new RPC
-- `consume_free_session()` that atomically increments it while still under
-- the cap. Direct UPDATEs of the column are revoked at the GRANT level so a
-- malicious client can't roll the counter back — same protection we already
-- give `free_trial_started_at`.
--
-- Migration semantics for existing accounts:
--   Anyone whose `free_trial_started_at` is already stamped is treated as
--   having burned 1 session (they used the old one-shot trial), so they get
--   4 fresh sessions, not 5. Everyone else starts at 0 → 5 fresh sessions.
--
-- The legacy `start_free_trial_if_unused()` RPC stays in place. The new
-- client doesn't call it, but keeping it costs nothing and avoids breaking
-- any old build that's still in flight.
--
-- Idempotent: safe to re-run. The backfill UPDATE is bounded to rows still at
-- the default 0, so a second run won't double-bump anyone above 1.
-- =============================================================================

-- ── column ──────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists free_sessions_used int not null default 0;

-- ── backfill ────────────────────────────────────────────────────────────────
-- Existing one-shot users count as having burned 1 session. Bounded to rows
-- still at 0 so re-running doesn't clobber anyone whose counter has since
-- climbed past 1 from real usage.
update public.profiles
   set free_sessions_used = 1
 where free_trial_started_at is not null
   and free_sessions_used = 0;

-- ── lock down direct UPDATE ─────────────────────────────────────────────────
-- The `profiles_self_update` policy (init migration) lets the user write any
-- column on their own row, so without this revoke a client could just `update
-- profiles set free_sessions_used = 0` and get unlimited free sessions. The
-- RPC below uses security definer to bypass this restriction on the server.
revoke update (free_sessions_used) on public.profiles from authenticated, anon;

-- ── consume RPC ─────────────────────────────────────────────────────────────
-- Atomic "increment if under the cap, else no-op". The WHERE guard means two
-- concurrent calls (sibling tabs) can't both succeed past the cap — one wins
-- the row lock, the other's WHERE no longer matches and the UPDATE returns 0
-- rows, so we fall through to the SELECT and surface the current count.
--
-- Returns the post-call count (an int 0..5). Callers can compare against 5
-- if they want to know whether the call was a real consume or a no-op, but
-- the gate logic doesn't need to — the same sessionStorage flag mechanism
-- that protected the one-shot trial still keeps the active session alive
-- regardless of count.
create or replace function public.consume_free_session()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
     set free_sessions_used    = free_sessions_used + 1,
         free_trial_started_at = coalesce(free_trial_started_at, now())
   where id = v_uid
     and free_sessions_used < 5
   returning free_sessions_used into v_count;

  if v_count is null then
    -- Already at the cap; surface the current count without incrementing.
    select free_sessions_used into v_count
      from public.profiles
     where id = v_uid;
  end if;

  return v_count;
end $$;

revoke all on function public.consume_free_session() from public;
grant execute on function public.consume_free_session() to authenticated;
