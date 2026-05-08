-- =============================================================================
-- Trace Mate — one active session per user
-- =============================================================================
-- Why
-- ────
-- We only want one device signed in to a given account at any time. Sign-
-- in (or sign-up) on device 2 must invalidate device 1's session. Supabase
-- itself doesn't enforce this — refresh tokens minted on different devices
-- are all individually valid until they expire.
--
-- How
-- ────
--   - profiles.current_session_id is a uuid stamped by claim_session() on
--     every fresh sign-in / sign-up. It is the canonical "this is the
--     device that owns the account right now" marker.
--   - Each device generates its own random session-id locally and calls
--     claim_session() right after authentication. The DB column is
--     overwritten — whichever call lands last wins. That call also
--     produces a postgres realtime UPDATE event, which the older device
--     subscribes to (filter id=eq.<self-uid>); when the event arrives and
--     the column != the device's local id, the client signs itself out.
--   - Token refreshes in the same tab keep the same local id, so they do
--     NOT re-claim — only fresh sign-ins do.
--
-- Backwards compatible: profiles rows that haven't yet been claimed have
-- current_session_id = null, which the client treats as "not enforced
-- yet". The first sign-in after this migration claims the row.
--
-- Idempotent — safe to re-run.
-- =============================================================================

alter table public.profiles
  add column if not exists current_session_id uuid;

-- Lock the column down so a malicious client can't bypass the RPC by
-- writing directly via the existing profiles_self_update policy. Writes
-- only happen through claim_session() (security definer).
revoke update (current_session_id) on public.profiles from authenticated, anon;

-- ── claim_session ───────────────────────────────────────────────────────────
-- Stamps the caller's row with the supplied session id. Returns the value
-- it wrote (so the client doesn't need to re-fetch the profile to know
-- the round-trip succeeded).
--
-- Rate-limited: 60/hour per user. A buggy client looping claim_session
-- would otherwise turn into a DoS on its own row's realtime channel.
-- Legit cadence is 1 per sign-in.
drop function if exists public.claim_session(uuid);

create function public.claim_session(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ok  boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_session_id is null then
    raise exception 'session id required';
  end if;

  select public.check_rate_limit(
    'claim_session:' || v_uid::text,
    60,
    3600
  ) into v_ok;
  if v_ok = false then
    -- Silent no-op — return whatever the row currently holds so the
    -- client doesn't observe an error. The cap is generous enough that
    -- a real user never hits it.
    return (select current_session_id from public.profiles where id = v_uid);
  end if;

  update public.profiles
     set current_session_id = p_session_id
   where id = v_uid;

  return p_session_id;
end $$;

revoke all on function public.claim_session(uuid) from public;
grant execute on function public.claim_session(uuid) to authenticated;
