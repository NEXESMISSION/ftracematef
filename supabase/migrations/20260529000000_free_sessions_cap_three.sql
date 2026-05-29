-- =============================================================================
-- Trace Mate — raise the free-tier session cap from 1 to 3
-- =============================================================================
-- The 1-session cap put the paywall in the path of a second drawing, which
-- helped conversion but also turned away users who hadn't yet built enough
-- trust to pay after a single trace. Three sessions is wide enough for a
-- user to develop the habit and to surface a sharper "I want this again"
-- moment, while still keeping the paywall meaningfully in front of repeat
-- users (3 << "unlimited").
--
-- Strategy:
--   1. Re-create consume_free_session() with the new cap. The atomic
--      "increment if under cap" semantic is preserved; only the literal
--      changes.
--   2. DON'T touch existing rows. Users with free_sessions_used = 1 from
--      the old 1-cap regime automatically get 2 more sessions under the
--      new cap (3 - 1 = 2). This matches the product ask of "give the
--      capped-out users their 2 free sessions" without mutating data.
--      Users with free_sessions_used >= 3 from old caps stay paywalled,
--      same as before.
--
-- The client mirror lives in lib/freeTrial.js (FREE_SESSION_LIMIT). Keep
-- the two in sync; the gate logic is server-authoritative because the RPC
-- enforces the cap, but the UI count needs to match what the server will
-- accept or users see "0 left" while the RPC still allows one through.
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
     and free_sessions_used < 3
   returning free_sessions_used into v_count;

  if v_count is null then
    -- Already at the cap; surface the current count without incrementing.
    -- Users carrying 4/5 from earlier (pre-tightening) caps stay at their
    -- existing number — the gate treats anything >= 3 as "used" so they're
    -- paywalled either way.
    select free_sessions_used into v_count
      from public.profiles
     where id = v_uid;
  end if;

  return v_count;
end $$;
