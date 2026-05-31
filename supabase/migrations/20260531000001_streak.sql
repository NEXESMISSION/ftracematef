-- ============================================================================
-- B2 — Daily tracing streak
-- ============================================================================
-- Tracks how many days in a row a user has traced. The client calls
-- record_trace_day() once when it enters the studio, passing its LOCAL date so
-- streaks respect the user's timezone (the server is UTC). The function is
-- idempotent per day: tracing twice on the same day never double-counts.
--
-- Idempotent migration: safe to re-run.

-- Streak columns on the profile.
alter table public.profiles
  add column if not exists current_streak  integer not null default 0,
  add column if not exists longest_streak  integer not null default 0,
  add column if not exists last_trace_date date;

-- record_trace_day(p_today) — advance the streak for the calling user.
--   * first trace ever, or first trace of a new day → recompute streak
--   * if yesterday was the last trace day → streak + 1, else streak resets to 1
--   * same day → no change
--   * a date earlier than the last (clock skew / travel) → no change
-- Returns the streak state + whether it advanced (so the client can celebrate).
create or replace function public.record_trace_day(p_today date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := coalesce(p_today, current_date);
  v_last  date;
  v_cur   integer;
  v_long  integer;
  v_incremented boolean := false;
begin
  select last_trace_date, current_streak, longest_streak
    into v_last, v_cur, v_long
  from public.profiles
  where id = auth.uid();

  if v_last is null or v_today > v_last then
    if v_last = v_today - 1 then
      v_cur := coalesce(v_cur, 0) + 1;
    else
      v_cur := 1;
    end if;
    v_long := greatest(coalesce(v_long, 0), v_cur);
    v_incremented := true;

    update public.profiles
       set current_streak  = v_cur,
           longest_streak  = v_long,
           last_trace_date = v_today
     where id = auth.uid();
  end if;

  return jsonb_build_object(
    'current_streak', coalesce(v_cur, 0),
    'longest_streak', coalesce(v_long, 0),
    'incremented',    v_incremented,
    'last_trace_date', v_today
  );
end;
$$;

grant execute on function public.record_trace_day(date) to authenticated;
