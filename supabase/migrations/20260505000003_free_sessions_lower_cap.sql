-- =============================================================================
-- Trace Mate — lower the free-tier session cap from 5 to 2
-- =============================================================================
-- Conversion data after a few weeks at 5 free sessions showed the bulk of
-- users who were going to convert decided well before they used all five —
-- the last 2-3 sessions were almost pure subsidy without nudging the
-- decision either way. Tightening the cap to 2 keeps the "try before you
-- buy" promise intact without giving away the store.
--
-- Strategy:
--   1. Re-create consume_free_session() with the new cap. The atomic
--      "increment if under cap" semantic is preserved; only the literal
--      changes.
--   2. DON'T retroactively penalise existing free users who've already
--      consumed >= 2 sessions under the old cap. They keep what they had,
--      but the next call hits the new cap. This is the kindest version of
--      a tightening change — nobody loses access they were already using.
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
     and free_sessions_used < 2
   returning free_sessions_used into v_count;

  if v_count is null then
    -- Already at the cap; surface the current count without incrementing.
    -- For users who consumed >2 under the old cap this returns whatever
    -- they actually have (3, 4, 5) — the gate will treat anything ≥ 2 as
    -- "used" so they're paywalled either way.
    select free_sessions_used into v_count
      from public.profiles
     where id = v_uid;
  end if;

  return v_count;
end $$;
