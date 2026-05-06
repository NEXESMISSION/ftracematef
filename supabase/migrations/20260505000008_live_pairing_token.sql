-- =============================================================================
-- Trace Mate — per-user pairing token for /live (replaces UUID-keyed channel)
-- =============================================================================
-- The /live page (user's own phone↔desktop pairing) currently uses
-- `live:${userId}` as the realtime signaling channel. Anyone holding the
-- public anon key plus a target user's UUID could subscribe and become a
-- "viewer" — channel-name-as-secret, where the secret is just a UUID
-- that's not normally exposed but absolutely DOES leak in real apps:
--   - frontend error logs (Sentry et al)
--   - shared screenshots / URLs
--   - analytics tools
--   - social features (leaderboards, public profiles)
-- One leaked UUID = passive monitoring of that user's /live broadcasts
-- forever. Privacy leak, not a data breach, but still worth closing.
--
-- Fix mirrors what we did for spectator: a server-issued random token
-- replaces the UUID in the channel key. Channel becomes
-- `live:${pairing_token}`. Token is:
--   - persistent per user (both devices need to find each other so it
--     can't rotate per-session — this isn't ephemeral signaling).
--   - readable ONLY by its owner via the get_live_pairing_token() RPC.
--   - directly-revoked from anon/authenticated, so even SELECT on the
--     table is forbidden — clients HAVE to go through the RPC.
--   - lazy-created on first call (no row required upfront).
--
-- A token that never rotates is no weaker than a UUID that never rotates,
-- with the crucial difference that the token is NOT exposed anywhere a
-- UUID might leak (URLs, logs, analytics — those carry the UUID, not the
-- token). The token only appears in the realtime channel name itself,
-- which is end-to-end-encrypted at the WebSocket layer.
--
-- Idempotent — safe to re-run.
-- =============================================================================

-- ── Table ───────────────────────────────────────────────────────────────────
create table if not exists public.live_pairing_tokens (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  token      uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.live_pairing_tokens enable row level security;

-- Deny all direct access. The token is the auth secret for the realtime
-- channel; clients must read it via the RPC, never via PostgREST. If a
-- future contributor adds a SELECT policy, this revoke still keeps the
-- token off the wire from a generic GET /rest/v1/live_pairing_tokens.
drop policy if exists "live_pairing_tokens_deny_all" on public.live_pairing_tokens;
create policy "live_pairing_tokens_deny_all" on public.live_pairing_tokens
  for all using (false) with check (false);
revoke all on public.live_pairing_tokens from anon, authenticated;

-- ── RPC: fetch (and lazily mint) the caller's token ────────────────────────
-- Returns a uuid the client uses as the channel-key in livePreview.js.
-- Two devices belonging to the same user both call this and get the same
-- token, so they meet on `live:${token}` without coordinating.
create or replace function public.get_live_pairing_token()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_token uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- ON CONFLICT (user_id) DO UPDATE — the touch on updated_at lets us
  -- prune dormant tokens later if we ever want to (none currently).
  -- The DO UPDATE is required so RETURNING fires; a no-op DO NOTHING
  -- would not return a row when the conflict path was taken.
  insert into public.live_pairing_tokens (user_id)
  values (v_uid)
  on conflict (user_id) do update
    set updated_at = now()
  returning token into v_token;

  return v_token;
end $$;

revoke all on function public.get_live_pairing_token() from public;
grant execute on function public.get_live_pairing_token() to authenticated;
