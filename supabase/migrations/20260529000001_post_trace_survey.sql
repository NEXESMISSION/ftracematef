-- =============================================================================
-- Trace Mate — post-trace survey (age + what they like to draw)
-- =============================================================================
-- Replaces the pre-trace "where did you hear / how does it feel" gate with a
-- shorter, warmer survey shown AFTER the user's first successful trace (i.e.
-- on their second /trace visit, gated in RequirePaid on trace_sessions >= 1).
-- Asking up front is intrusive; asking once the user has felt the product win
-- gets far higher-quality answers — and the two questions feed a recommendation
-- flywheel rather than pure attribution:
--   1. How old are you?            (single bucket)
--   2. What do you like to draw?   (multi-select — anime / animals / tattoos …)
--
-- The legacy exit_survey_* columns + record_exit_survey() are left untouched
-- (harmless, just no longer written by the client). This migration adds a
-- fresh, independent set so old data isn't mutated.
--
-- All columns sparse: a user who closes the survey without answering keeps
-- everything null and is re-prompted on the next /trace hit. The RPC writes
-- only when survey_completed_at is still null (idempotent), so a double-tap
-- on submit can't overwrite an earlier answer.
--
-- Idempotent — safe to re-run.
-- =============================================================================

alter table public.profiles
  add column if not exists survey_completed_at timestamptz,
  add column if not exists survey_age          text,
  add column if not exists survey_draws        text[];

-- Lock the new columns down — only the security-definer RPC below may write
-- them, NOT the broad self-update policy on profiles. Without this revoke a
-- user could PATCH their own row and smuggle arbitrary values into the
-- admin dashboard buckets.
revoke update (
  survey_completed_at,
  survey_age,
  survey_draws
) on public.profiles from authenticated, anon;

-- ── record_survey ──────────────────────────────────────────────────────────
-- Idempotent: only writes when survey_completed_at is still null. Both answer
-- sets are whitelisted server-side; draws is multi-select, so we filter the
-- incoming array down to the known set, dedupe, and cap the count defensively.
create or replace function public.record_survey(
  p_age   text,
  p_draws text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_age   text;
  v_draws text[];
begin
  if v_uid is null then return; end if;

  -- Whitelist age. Anything outside the closed set collapses to null rather
  -- than a bogus bucket — the client requires a pick, this is just defense.
  v_age := lower(trim(coalesce(p_age, '')));
  if v_age not in ('13-17','18-24','25-34','35-44','45+') then
    v_age := null;
  end if;

  -- Filter draws to the known categories, lowercased + trimmed, de-duped,
  -- and capped at 8 so a malicious client can't stuff the array.
  select array_agg(d order by d)
    into v_draws
  from (
    select distinct lower(trim(x)) as d
      from unnest(coalesce(p_draws, '{}'::text[])) as x
     where lower(trim(x)) in (
       'anime','characters','animals','portraits',
       'tattoos','nature','lettering','fanart','other'
     )
     limit 8
  ) s;

  update public.profiles
     set survey_completed_at = now(),
         survey_age          = v_age,
         survey_draws        = coalesce(v_draws, '{}'::text[])
   where id = v_uid
     and survey_completed_at is null;
end $$;

revoke all    on function public.record_survey(text, text[]) from public;
grant execute on function public.record_survey(text, text[]) to authenticated;
