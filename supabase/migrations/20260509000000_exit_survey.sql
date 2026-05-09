-- =============================================================================
-- Trace Mate — exit-survey for users who burned their free trial
-- =============================================================================
-- After a user finishes their one free trace and bounces back to /trace, we
-- show a tiny two-question survey before the paywall:
--   1. how did you hear about us?  (a closed list — TikTok / Reddit / friend / …)
--   2. how did the trace feel?     (loved / liked / mixed / disliked)
-- Plus an optional one-line note. Submitted answers are stamped on the
-- profile (one-shot — never re-shown), so the admin dashboard can answer
-- "of the users who hit the paywall, where did they come from and did they
-- enjoy the product?" without inferring it from referrers.
--
-- signup_source already tracks first-touch attribution from /r/:source links,
-- but that only fires for users who clicked a tagged short-link. The survey
-- catches the long tail (direct, organic search, word-of-mouth) AND adds
-- sentiment, which referrers can't.
--
-- All columns sparse: a user who closes the survey without answering keeps
-- everything null and will be re-prompted on the next /trace hit. The RPC
-- writes only when the column is still null (idempotent), so a double-tap
-- on submit doesn't overwrite a previous answer in a fresh session.
-- =============================================================================

alter table public.profiles
  add column if not exists exit_survey_at      timestamptz,
  add column if not exists exit_survey_source  text,
  add column if not exists exit_survey_feeling text,
  add column if not exists exit_survey_note    text;

-- Lock the new columns down — only the security-definer RPC below should
-- write them, NOT the broad self-update policy on profiles. Without this
-- revoke, a user could PATCH their own row and rewrite their feedback.
revoke update (
  exit_survey_at,
  exit_survey_source,
  exit_survey_feeling,
  exit_survey_note
) on public.profiles from authenticated, anon;

-- ── record_exit_survey ────────────────────────────────────────────────────
-- Idempotent: only writes when exit_survey_at is still null. The set of
-- accepted values for source/feeling is enforced server-side so a malicious
-- client can't smuggle arbitrary strings into the admin dashboard buckets.
--
-- p_note is free-text but trimmed to 280 chars — long enough for a real
-- thought, short enough to stay readable in the admin user drawer.
create or replace function public.record_exit_survey(
  p_source  text,
  p_feeling text,
  p_note    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_source  text;
  v_feeling text;
  v_note    text;
begin
  if v_uid is null then return; end if;

  -- Whitelist source. Anything outside the closed set collapses to 'other'
  -- so the admin's bucket counts stay clean.
  v_source := lower(trim(coalesce(p_source, '')));
  if v_source not in (
    'tiktok','instagram','youtube','reddit','twitter','facebook',
    'google','friend','pinterest','threads','other'
  ) then
    v_source := 'other';
  end if;

  v_feeling := lower(trim(coalesce(p_feeling, '')));
  if v_feeling not in ('loved','liked','mixed','disliked') then
    v_feeling := 'mixed';
  end if;

  v_note := nullif(left(trim(coalesce(p_note, '')), 280), '');

  update public.profiles
     set exit_survey_at      = now(),
         exit_survey_source  = v_source,
         exit_survey_feeling = v_feeling,
         exit_survey_note    = v_note
   where id = v_uid
     and exit_survey_at is null;
end $$;

revoke all     on function public.record_exit_survey(text, text, text) from public;
grant execute  on function public.record_exit_survey(text, text, text) to authenticated;
