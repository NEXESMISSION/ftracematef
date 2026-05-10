-- =============================================================================
-- Trace Mate — expand the exit-survey source whitelist
-- =============================================================================
-- The original record_exit_survey() (in 20260509000000_exit_survey.sql) hard-
-- coded an 11-value whitelist; anything outside it collapsed to 'other'. The
-- client-side ExitSurvey now offers a wider set of channels — AI assistants
-- (ChatGPT / Gemini / Claude / Copilot / Perplexity / Grok), LinkedIn,
-- Discord, blog/article, podcast, app store — and we want each to show up as
-- its own bucket on the admin dashboard instead of all of them merging into
-- 'other'.
--
-- AI is added FIRST because it is rapidly becoming the dominant acquisition
-- channel for indie tools — knowing whether new users come from a chatbot
-- recommendation vs. a TikTok video changes how we invest in content.
--
-- Idempotent — safe to re-run.
-- =============================================================================

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

  v_source := lower(trim(coalesce(p_source, '')));
  if v_source not in (
    -- New: AI assistants and additional discovery channels.
    'ai','linkedin','discord','blog','podcast','app_store',
    -- Original whitelist (kept verbatim for backwards compatibility with
    -- any client build still in flight).
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
