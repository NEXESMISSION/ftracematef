-- =============================================================================
-- Trace Mate — optional free-text note on the post-trace survey
-- =============================================================================
-- Users now get a third (optional) field on the survey: a short note for a
-- request or a piece of feedback. Capped at 280 chars server-side so a
-- runaway paste can't bloat the profiles row or the admin export.
--
-- record_survey() grows a p_note param (defaulted null so any existing call
-- site that omits it still works). The old 2-arg signature is dropped so
-- PostgREST doesn't see ambiguous overloads.
--
-- Idempotent — safe to re-run.
-- =============================================================================

alter table public.profiles
  add column if not exists survey_note text;

revoke update (survey_note) on public.profiles from authenticated, anon;

-- Drop prior signatures so the new 3-arg defaulted version is the only one
-- PostgREST can resolve.
drop function if exists public.record_survey(text, text[]);
drop function if exists public.record_survey(text, text[], text);
create or replace function public.record_survey(
  p_age   text,
  p_draws text[]  default '{}',
  p_note  text    default null
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
  v_note  text;
begin
  if v_uid is null then return; end if;

  v_age := lower(trim(coalesce(p_age, '')));
  if v_age not in ('13-17','18-24','25-34','35-44','45+') then
    v_age := null;
  end if;

  select array_agg(d order by d) into v_draws
  from (
    select distinct lower(trim(x)) as d
    from unnest(coalesce(p_draws, '{}'::text[])) as x
    where lower(trim(x)) in (
      'anime','characters','animals','portraits','tattoos',
      'nature','lettering','fanart','other'
    )
    limit 8
  ) s;

  -- Trim + cap the note. Empty string → null so the admin view doesn't show
  -- a "respondent left a note" row for someone who only hit Tab through it.
  v_note := nullif(trim(coalesce(p_note, '')), '');
  if v_note is not null and length(v_note) > 280 then
    v_note := substring(v_note from 1 for 280);
  end if;

  update public.profiles
     set survey_completed_at = now(),
         survey_age          = v_age,
         survey_draws        = coalesce(v_draws, '{}'::text[]),
         survey_note         = v_note
   where id = v_uid
     and survey_completed_at is null;
end $$;

revoke all    on function public.record_survey(text, text[], text) from public;
grant execute on function public.record_survey(text, text[], text) to authenticated;
