-- =============================================================================
-- Trace Mate — user journey tracking (why did they sign up? where did they fall off?)
-- =============================================================================
-- Today, an operator looking at /admin-me can tell that a user signed up
-- and never traced — but not WHY they signed up, what they came in for,
-- or where they fell off the funnel. The dashboard's existing funnel
-- (signed_up → opened_studio → used_trial → paid) only counts hops; it
-- doesn't say "this specific user got as far as the paywall before
-- bouncing".
--
-- Capture five sparse "first time" stamps + the signup landing page +
-- referrer per profile. Sparse means: never overwritten after first set,
-- and NULL for everything we haven't observed (so old users from before
-- this migration stay null — that's the right signal, not a backfill bug).
--
-- Five columns + two strings:
--   signup_landing      — which app route the user signed up FROM
--                         ('welcome', 'pricing', 'upload', 'login', etc.)
--   signup_referrer     — document.referrer at signup, trimmed to 500 chars
--                         (so we can tell organic / social / direct apart)
--   first_pricing_at    — first time the user opened /pricing as a logged-in user
--   first_paywall_at    — first time the paywall blocked them
--   first_checkout_at   — first time they clicked through to Dodo checkout
--
-- Together these answer the operator's "why are these ghost users here?"
-- question: classifier in the admin UI maps each user to one of:
--   ghost / price-curious / tried / paywall-stalled / checkout-abandoned / paid
--
-- The RPCs below are idempotent — calling mark_journey_event('pricing')
-- twice only sets first_pricing_at the FIRST time. Best-effort from the
-- client; failures don't block UX (auth.uid() check guards against unsigned
-- callers, no other validation needed since these are sparse stamps).
-- =============================================================================

alter table public.profiles
  add column if not exists signup_landing    text,
  add column if not exists signup_referrer   text,
  add column if not exists first_pricing_at  timestamptz,
  add column if not exists first_paywall_at  timestamptz,
  add column if not exists first_checkout_at timestamptz;

-- Lock the new columns down — only the security-definer RPCs below should
-- write them, NOT the broad `update profiles` self-update policy. Without
-- this revoke, a user could self-stamp first_paid_at-equivalent fields and
-- skew the operator's funnel.
revoke update (
  signup_landing,
  signup_referrer,
  first_pricing_at,
  first_paywall_at,
  first_checkout_at
) on public.profiles from authenticated, anon;

-- ── record_signup_context ─────────────────────────────────────────────────
-- Called by the client right after sign-up (AuthProvider sees a profile
-- whose created_at is < 60s old → calls this once). Idempotent: only
-- writes if the columns are still null, so an OAuth callback that
-- re-enters the auth flow doesn't overwrite the original landing page.
create or replace function public.record_signup_context(
  p_landing  text,
  p_referrer text
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
     set signup_landing  = case when signup_landing  is null then nullif(left(coalesce(p_landing,  ''), 60),  '') else signup_landing  end,
         signup_referrer = case when signup_referrer is null then nullif(left(coalesce(p_referrer, ''), 500), '') else signup_referrer end
   where id = v_uid
     and (signup_landing is null or signup_referrer is null);
end $$;

revoke all     on function public.record_signup_context(text, text) from public;
grant execute  on function public.record_signup_context(text, text) to authenticated;

-- ── mark_journey_event ────────────────────────────────────────────────────
-- Stamps the matching "first occurrence" timestamp for the given event.
-- Idempotent (uses `is null` in WHERE so a re-fire never overwrites).
-- Unknown event names no-op silently — they're best-effort UX hints, not
-- contracts; a future client typo shouldn't fail loudly.
create or replace function public.mark_journey_event(p_event text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;

  if p_event = 'pricing' then
    update public.profiles set first_pricing_at = now()
     where id = v_uid and first_pricing_at is null;
  elsif p_event = 'paywall' then
    update public.profiles set first_paywall_at = now()
     where id = v_uid and first_paywall_at is null;
  elsif p_event = 'checkout' then
    update public.profiles set first_checkout_at = now()
     where id = v_uid and first_checkout_at is null;
  end if;
end $$;

revoke all     on function public.mark_journey_event(text) from public;
grant execute  on function public.mark_journey_event(text) to authenticated;
