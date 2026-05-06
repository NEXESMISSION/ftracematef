-- =============================================================================
-- Trace Mate — get_admin_stats() server-side analytics rollup
-- =============================================================================
-- Until now the admin dashboard rendered raw per-user rows and let the
-- operator eyeball patterns. With more users that's no longer enough — we
-- need rolled-up numbers to make decisions ("is conversion getting better
-- after the cap drop?", "which users are at risk of churning?", "is
-- engagement trending up or down?").
--
-- This RPC computes everything in one shot, server-side, with the service
-- role bypassing RLS. The edge function calls it from the same handler
-- that does the admin gate, so the cost of computing all of this is one
-- round trip and one transaction.
--
-- Returned shape (jsonb):
--   {
--     funnel: {
--       signed_up:       int,    -- everyone with a profile
--       opened_studio:   int,    -- ever bumped trace_sessions ≥ 1
--       used_trial:      int,    -- ever bumped free_sessions_used ≥ 1
--       currently_paid:  int     -- has an active paying subscription right now
--     },
--     revenue: {
--       mrr_cents:              bigint,  -- monthly-equivalent of active recurring
--       lifetime_revenue_cents: bigint,  -- sum of all paid subscription rows ever
--       paid_today:             int,
--       paid_this_week:         int,
--       paid_this_month:        int,
--       plans:                  { monthly: n, quarterly: n, lifetime: n, ... }
--     },
--     activity: [                      -- last 14 days, oldest-first
--       { date, signups, tracings, paid }
--     ],
--     engagement: {
--       active_24h:  int,   -- distinct users with last_seen_at in last 24h
--       active_7d:   int,
--       tracings_24h:        int,
--       tracings_7d:         int,
--       tracing_seconds_24h: bigint,
--       tracing_seconds_7d:  bigint
--     },
--     top_users:  [{ id, email, display_name, total_trace_seconds, trace_sessions }],
--     at_risk:    [{ id, email, display_name, last_seen_at, plan, current_period_end }],
--     computed_at: timestamptz
--   }
--
-- Idempotent — safe to re-run. Granted to service_role only; the edge
-- function does the admin authorization gate.
-- =============================================================================

create or replace function public.get_admin_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now          timestamptz := now();
  v_today_start  timestamptz := date_trunc('day', v_now);
  v_24h          timestamptz := v_now - interval '24 hours';
  v_7d           timestamptz := v_now - interval '7 days';
  v_30d          timestamptz := v_now - interval '30 days';
  v_month_start  timestamptz := date_trunc('month', v_now);
  v_renewal_grace interval := interval '6 hours';

  v_funnel       jsonb;
  v_revenue      jsonb;
  v_activity     jsonb;
  v_engagement   jsonb;
  v_top_users    jsonb;
  v_at_risk      jsonb;
  v_paid_user_ids uuid[];
begin
  -- ── Currently-paid user ids (one source of truth, reused below) ──────────
  select array_agg(distinct s.user_id)
    from public.subscriptions s
   where s.status = 'active'
     and s.plan != 'free'
     and (
       s.plan = 'lifetime'
       or (s.current_period_end is not null and (
         case when s.cancel_at_next_billing_date
           then s.current_period_end > v_now
           else s.current_period_end + v_renewal_grace > v_now
         end
       ))
     )
    into v_paid_user_ids;

  v_paid_user_ids := coalesce(v_paid_user_ids, '{}'::uuid[]);

  -- ── Funnel: signed_up → opened_studio → used_trial → currently_paid ──────
  -- Each stage counted independently (not nested) so the operator sees raw
  -- counts and can compute their own conversion ratios in the UI.
  select jsonb_build_object(
    'signed_up',      count(*),
    'opened_studio',  count(*) filter (where p.trace_sessions > 0),
    'used_trial',     count(*) filter (where p.free_sessions_used > 0),
    'currently_paid', cardinality(v_paid_user_ids)
  )
    from public.profiles p
    into v_funnel;

  -- ── Revenue ──────────────────────────────────────────────────────────────
  -- MRR normalises non-monthly recurring plans to a monthly equivalent so
  -- the headline number stays comparable across plan changes:
  --    monthly  → amount
  --    quarterly→ amount / 3
  --    yearly   → amount / 12  (in case you add it later)
  -- Lifetime is one-time, contributes 0 to MRR but counts in lifetime_revenue.
  with active_recurring as (
    select plan, amount_cents
      from public.subscriptions
     where status = 'active'
       and plan != 'free'
       and plan != 'lifetime'
       and amount_cents is not null
  )
  select jsonb_build_object(
    'mrr_cents', (
      select coalesce(sum(case
        when plan = 'monthly'   then amount_cents::numeric
        when plan = 'quarterly' then amount_cents::numeric / 3
        when plan = 'yearly'    then amount_cents::numeric / 12
        else 0
      end), 0)::bigint
        from active_recurring
    ),
    'lifetime_revenue_cents', (
      select coalesce(sum(amount_cents), 0)::bigint
        from public.subscriptions
       where plan != 'free'
         and amount_cents is not null
    ),
    'paid_today', (
      select count(*) from public.subscriptions
       where plan != 'free' and created_at >= v_today_start
    ),
    'paid_this_week', (
      select count(*) from public.subscriptions
       where plan != 'free' and created_at >= v_7d
    ),
    'paid_this_month', (
      select count(*) from public.subscriptions
       where plan != 'free' and created_at >= v_month_start
    ),
    'plans', coalesce((
      select jsonb_object_agg(plan, n)
        from (
          select plan::text as plan, count(*) as n
            from public.subscriptions
           where status = 'active' and plan != 'free'
           group by plan
        ) z
    ), '{}'::jsonb)
  ) into v_revenue;

  -- ── Activity: last 14 days, daily counts of signups + tracings + paid ───
  with days as (
    select generate_series(
      date_trunc('day', v_now - interval '13 days'),
      date_trunc('day', v_now),
      interval '1 day'
    )::date as d
  ),
  signups as (
    select date_trunc('day', created_at)::date as d, count(*) as n
      from public.profiles
     where created_at >= v_now - interval '14 days'
     group by 1
  ),
  tracings as (
    select date_trunc('day', started_at)::date as d, count(*) as n
      from public.trace_session_runs
     where started_at >= v_now - interval '14 days'
     group by 1
  ),
  paid_conv as (
    select date_trunc('day', created_at)::date as d, count(*) as n
      from public.subscriptions
     where plan != 'free' and created_at >= v_now - interval '14 days'
     group by 1
  )
  select jsonb_agg(jsonb_build_object(
    'date',     to_char(d.d, 'YYYY-MM-DD'),
    'signups',  coalesce(s.n, 0),
    'tracings', coalesce(t.n, 0),
    'paid',     coalesce(p.n, 0)
  ) order by d.d)
    from days d
    left join signups  s on s.d = d.d
    left join tracings t on t.d = d.d
    left join paid_conv p on p.d = d.d
    into v_activity;

  -- ── Engagement (last 24h / 7d) ───────────────────────────────────────────
  select jsonb_build_object(
    'active_24h', (
      select count(*) from public.profiles where last_seen_at >= v_24h
    ),
    'active_7d', (
      select count(*) from public.profiles where last_seen_at >= v_7d
    ),
    'tracings_24h', (
      select count(*) from public.trace_session_runs where started_at >= v_24h
    ),
    'tracings_7d', (
      select count(*) from public.trace_session_runs where started_at >= v_7d
    ),
    'tracing_seconds_24h', (
      select coalesce(sum(duration_seconds), 0)::bigint
        from public.trace_session_runs
       where started_at >= v_24h and duration_seconds is not null
    ),
    'tracing_seconds_7d', (
      select coalesce(sum(duration_seconds), 0)::bigint
        from public.trace_session_runs
       where started_at >= v_7d and duration_seconds is not null
    )
  ) into v_engagement;

  -- ── Top users by total time traced (drives "who's most engaged?") ───────
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',                  id,
    'email',               email,
    'display_name',        display_name,
    'total_trace_seconds', total_trace_seconds,
    'trace_sessions',      trace_sessions,
    'is_paid',             id = any(v_paid_user_ids)
  ) order by total_trace_seconds desc), '[]'::jsonb)
    from (
      select id, email, display_name, total_trace_seconds, trace_sessions
        from public.profiles
       where total_trace_seconds > 0
       order by total_trace_seconds desc
       limit 8
    ) z
    into v_top_users;

  -- ── At-risk: paid users we haven't seen in 14+ days (or never) ──────────
  -- Strong retention signal — if they haven't opened the app in two weeks
  -- on a paying plan, the next renewal is the most likely cancel point.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',                 p.id,
    'email',              p.email,
    'display_name',       p.display_name,
    'last_seen_at',       p.last_seen_at,
    'plan',               s.plan,
    'current_period_end', s.current_period_end,
    'days_since_seen',    case
      when p.last_seen_at is null then null
      else extract(day from v_now - p.last_seen_at)::int
    end
  ) order by p.last_seen_at asc nulls first), '[]'::jsonb)
    from public.profiles p
    join public.subscriptions s
      on s.user_id = p.id
     and s.status = 'active'
     and s.plan != 'free'
     and s.plan != 'lifetime'
   where (p.last_seen_at is null or p.last_seen_at < v_now - interval '14 days')
   limit 20
   into v_at_risk;

  return jsonb_build_object(
    'funnel',      v_funnel,
    'revenue',     v_revenue,
    'activity',    coalesce(v_activity, '[]'::jsonb),
    'engagement',  v_engagement,
    'top_users',   v_top_users,
    'at_risk',     v_at_risk,
    'computed_at', v_now
  );
end $$;

revoke all on function public.get_admin_stats() from public;
grant execute on function public.get_admin_stats() to service_role;
