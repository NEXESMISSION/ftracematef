-- =============================================================================
-- Trace Mate — signup source attribution (tracemate.art/r/:source)
-- =============================================================================
-- We already capture signup_landing (the route the user signed up FROM) and
-- signup_referrer (document.referrer). Those answer "where in the app did
-- they sign up?" but NOT "which marketing channel sent them here?":
--   - signup_landing collapses to '' / 'welcome' / 'pricing' for almost
--     every real signup, because tracemate.art/tiktok renders <NotFound />
--     and even when it didn't, the landing column is overwritten as the
--     user navigates around before signing up.
--   - signup_referrer is unreliable: TikTok / Instagram / Twitter in-app
--     browsers strip the Referer header, so most social traffic shows up
--     as direct.
--
-- The dedicated /r/:source route handler in the SPA persists the source
-- slug to localStorage (first-touch — never overwritten on subsequent
-- visits). On first sign-in, AuthProvider passes that slug + an optional
-- campaign sub-label to the RPC below, which stamps it on the profile.
--
-- Two columns instead of overloading signup_landing because the operator
-- needs to filter "all TikTok signups regardless of which page they
-- eventually signed up from", which a single combined column can't do.
-- =============================================================================

alter table public.profiles
  add column if not exists signup_source   text,
  add column if not exists signup_campaign text;

-- Lock the new columns down. As with the existing journey columns, we don't
-- want a logged-in user to PATCH their own profile and rewrite where they
-- "came from" — only the security-definer RPC below should write them.
revoke update (
  signup_source,
  signup_campaign
) on public.profiles from authenticated, anon;

-- ── record_signup_context (extended) ──────────────────────────────────────
-- Replaces the 2-arg version from 20260506200000_user_journey.sql with a
-- 4-arg version that ALSO stamps signup_source + signup_campaign. Same
-- idempotency rule as before (only writes if the column is still null), so
-- a returning OAuth round-trip can't overwrite the original first-touch
-- attribution.
--
-- Drop first because we're changing the signature: Postgres treats
-- (text, text) and (text, text, text, text) as two distinct functions and
-- would happily keep both around, leading to "function is not unique"
-- errors at call time.
drop function if exists public.record_signup_context(text, text);

create or replace function public.record_signup_context(
  p_landing  text,
  p_referrer text,
  p_source   text default null,
  p_campaign text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;

  update public.profiles
     set signup_landing   = case when signup_landing   is null then nullif(left(coalesce(p_landing,   ''), 60),  '') else signup_landing   end,
         signup_referrer  = case when signup_referrer  is null then nullif(left(coalesce(p_referrer,  ''), 500), '') else signup_referrer  end,
         signup_source    = case when signup_source    is null then nullif(left(lower(coalesce(p_source,   '')), 32),  '') else signup_source    end,
         signup_campaign  = case when signup_campaign  is null then nullif(left(coalesce(p_campaign,  ''), 60),  '') else signup_campaign  end
   where id = v_uid
     and (
       signup_landing  is null or
       signup_referrer is null or
       signup_source   is null or
       signup_campaign is null
     );
end $$;

revoke all     on function public.record_signup_context(text, text, text, text) from public;
grant execute  on function public.record_signup_context(text, text, text, text) to authenticated;

-- ── backfill ──────────────────────────────────────────────────────────────
-- Recover existing rows that signed up via short links BEFORE the route
-- handler existed (signup_landing got the bare slug because the path
-- segment fell through to <NotFound />). One-shot, idempotent:
update public.profiles
   set signup_source = lower(signup_landing)
 where signup_source is null
   and lower(coalesce(signup_landing, '')) in
       ('tiktok','tt','reddit','rd','yt','youtube','ig','instagram','x','twitter','fb','facebook','pin','pinterest','threads','linkedin');
