-- =============================================================================
-- Trace Mate — record which plan a "Bailed checkout" user actually picked
-- =============================================================================
-- Today, first_checkout_at tells us *when* the user clicked through to Dodo
-- but bailed — not *which plan* they tried to buy. The admin dashboard's
-- "Bailed checkout" segment is therefore blind: every recoverable lead
-- looks the same, even though a $25 lifetime bail is a very different
-- conversation than a $7/mo monthly bail.
--
-- Two new sparse columns on profiles:
--   last_checkout_plan  — most-recent plan id the user opened on Dodo
--                         (one of 'monthly' | 'quarterly' | 'lifetime')
--   last_checkout_at    — timestamp of that attempt (overwritten on retry,
--                         unlike first_checkout_at which is sticky)
--
-- mark_journey_event gains an optional second arg `p_plan` so the existing
-- 'pricing' / 'paywall' callers stay no-arg and the 'checkout' caller can
-- pass the plan it just opened. Unknown plan strings are dropped silently
-- so a future client typo can't smuggle garbage into the column.
-- =============================================================================

alter table public.profiles
  add column if not exists last_checkout_plan text,
  add column if not exists last_checkout_at   timestamptz;

-- Same lock-down pattern as the rest of the journey columns: only the
-- security-definer RPC below should write these, never the broad
-- self-update policy on profiles.
revoke update (
  last_checkout_plan,
  last_checkout_at
) on public.profiles from authenticated, anon;

-- ── mark_journey_event (extended) ─────────────────────────────────────────
-- Drop the old single-arg signature first — `create or replace` cannot
-- change the argument list, only the body. PostgREST matches RPC calls
-- by argument *names*, so existing callers that pass `{ p_event: 'pricing' }`
-- will still resolve to the new function thanks to `p_plan`'s default.
drop function if exists public.mark_journey_event(text);

create or replace function public.mark_journey_event(
  p_event text,
  p_plan  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_plan text;
begin
  if v_uid is null then return; end if;

  if p_event = 'pricing' then
    update public.profiles set first_pricing_at = now()
     where id = v_uid and first_pricing_at is null;
  elsif p_event = 'paywall' then
    update public.profiles set first_paywall_at = now()
     where id = v_uid and first_paywall_at is null;
  elsif p_event = 'checkout' then
    -- Whitelist the plan id so a future client typo or hostile payload
    -- can't poison the column. Anything outside the known set falls back
    -- to null — we still stamp the timestamp so the funnel classifier
    -- keeps working even if the plan label is missing.
    v_plan := case
      when p_plan in ('monthly', 'quarterly', 'lifetime') then p_plan
      else null
    end;

    update public.profiles
       set first_checkout_at = coalesce(first_checkout_at, now()),
           last_checkout_at  = now(),
           last_checkout_plan = coalesce(v_plan, last_checkout_plan)
     where id = v_uid;
  end if;
end $$;

revoke all     on function public.mark_journey_event(text, text) from public;
grant execute  on function public.mark_journey_event(text, text) to authenticated;
