-- =============================================================================
-- Trace Mate — lower the free-tier session cap from 2 to 1
-- =============================================================================
-- Cohort data after the 5 → 2 tightening showed users are overwhelmingly
-- one-and-done: of 41 tracers, 95% only ever traced on a single calendar day.
-- The product is closer to a tool ("I have one drawing to do tonight") than
-- a service, so a 2-session free budget meant most users finished what they
-- came for inside the free tier and never reached the paywall.
--
-- Tightening to 1 puts the paywall in the path of any user who wants a second
-- drawing — which is the only point where the buying decision is actually live.
-- Users who already consumed >= 1 session under the old cap keep what they had;
-- their next attempt just hits the new cap one session sooner.
--
-- Server-authoritative: the RPC enforces the cap; the client constant
-- (FREE_SESSION_LIMIT in lib/freeTrial.js) only drives UI labels. Both are
-- kept in sync.
--
-- Idempotent — safe to re-run. CREATE OR REPLACE swaps the function body
-- in place; nothing else changes.
-- =============================================================================

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
     and free_sessions_used < 1
   returning free_sessions_used into v_count;

  if v_count is null then
    -- Already at the cap; surface the current count without incrementing.
    -- Existing users with a count of 2/3/4/5 from earlier caps stay at their
    -- existing number — the gate treats anything >= 1 as "used" so they're
    -- paywalled either way.
    select free_sessions_used into v_count
      from public.profiles
     where id = v_uid;
  end if;

  return v_count;
end $$;
