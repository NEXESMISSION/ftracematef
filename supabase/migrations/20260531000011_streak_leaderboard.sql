-- ============================================================================
-- B2 — streak leaderboard
-- ============================================================================
-- Ranks users by their CURRENT daily-tracing streak (longest as the tiebreak,
-- then who started earlier). Security-definer so it can read across users while
-- exposing only safe display fields (no email). Admins excluded so the operator
-- account doesn't sit on top.
--
-- Idempotent.

create or replace function public.get_streak_leaderboard(p_limit int default 20)
returns table (
  rank           bigint,
  display_name   text,
  avatar_url     text,
  current_streak integer,
  longest_streak integer
)
language sql
security definer
set search_path = public
as $$
  select
    row_number() over (
      order by coalesce(p.current_streak, 0) desc,
               coalesce(p.longest_streak, 0) desc,
               p.first_trace_at asc nulls last
    ) as rank,
    coalesce(nullif(p.display_name, ''), 'Artist') as display_name,
    p.avatar_url,
    coalesce(p.current_streak, 0) as current_streak,
    coalesce(p.longest_streak, 0) as longest_streak
  from public.profiles p
  where coalesce(p.is_admin, false) = false
    and coalesce(p.current_streak, 0) > 0
  order by coalesce(p.current_streak, 0) desc,
           coalesce(p.longest_streak, 0) desc,
           p.first_trace_at asc nulls last
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.get_streak_leaderboard(int) to anon, authenticated;
