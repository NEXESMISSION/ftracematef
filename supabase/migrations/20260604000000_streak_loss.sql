-- ============================================================================
-- Streak loss signal.
-- ============================================================================
-- record_trace_day() already resets the streak to 1 when a day is missed, but
-- it never told the client a streak was LOST — so we couldn't show the user a
-- "you lost your N-day streak" moment. This re-creates it to also return
-- `was_reset` (true when a missed day broke an existing streak) and
-- `lost_streak` (the streak value that was lost), so /trace can show the right
-- popup: lost → encourage a restart; continued → celebrate + nudge the board.
-- Idempotent (CREATE OR REPLACE); signature unchanged.

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
  v_prev  integer;
  v_incremented boolean := false;
  v_was_reset   boolean := false;
begin
  select last_trace_date, current_streak, longest_streak
    into v_last, v_cur, v_long
  from public.profiles
  where id = auth.uid();

  v_prev := coalesce(v_cur, 0);

  if v_last is null or v_today > v_last then
    if v_last = v_today - 1 then
      v_cur := coalesce(v_cur, 0) + 1;          -- consecutive day → advance
    else
      -- Missed at least one day (or first trace ever). Reset to 1; flag a loss
      -- only when there WAS a streak to lose (so a brand-new user isn't told
      -- they lost something).
      v_was_reset := (v_last is not null and v_prev >= 1);
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
    'current_streak',  coalesce(v_cur, 0),
    'longest_streak',  coalesce(v_long, 0),
    'incremented',     v_incremented,
    'was_reset',       v_was_reset,
    'lost_streak',     case when v_was_reset then v_prev else 0 end,
    'last_trace_date', v_today
  );
end;
$$;

grant execute on function public.record_trace_day(date) to authenticated;
