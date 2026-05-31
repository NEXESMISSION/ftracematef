-- ============================================================================
-- C1 — leaderboard: make it result-based (rank by traces OR time)
-- ============================================================================
-- The first cut ranked only by trace_sessions and didn't expose time. This
-- replaces get_leaderboard so the client can rank by the metric that actually
-- reflects results — number of images traced, or total time spent tracing —
-- and shows both numbers on every row.
--
-- p_metric: 'traces' (default) ranks by trace_sessions; 'time' ranks by
-- total_trace_seconds. Ties break on whoever started tracing earlier.
--
-- Idempotent (create or replace).

create or replace function public.get_leaderboard(
  p_limit  int  default 20,
  p_metric text default 'traces'
)
returns table (
  rank                bigint,
  display_name        text,
  avatar_url          text,
  trace_sessions      integer,
  total_trace_seconds bigint,
  current_streak      integer
)
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select
      coalesce(nullif(p.display_name, ''), split_part(coalesce(p.email, 'Artist'), '@', 1)) as display_name,
      p.avatar_url,
      coalesce(p.trace_sessions, 0)        as trace_sessions,
      coalesce(p.total_trace_seconds, 0)   as total_trace_seconds,
      coalesce(p.current_streak, 0)        as current_streak,
      p.first_trace_at
    from public.profiles p
    where coalesce(p.is_admin, false) = false
      and coalesce(p.trace_sessions, 0) > 0
  )
  select
    row_number() over (
      order by
        case when p_metric = 'time' then total_trace_seconds else trace_sessions end desc,
        first_trace_at asc
    ) as rank,
    display_name,
    avatar_url,
    trace_sessions,
    total_trace_seconds,
    current_streak
  from ranked
  order by
    case when p_metric = 'time' then total_trace_seconds else trace_sessions end desc,
    first_trace_at asc
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.get_leaderboard(int, text) to anon, authenticated;
