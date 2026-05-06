-- =============================================================================
-- Trace Mate — get_admin_stats(): cast plan to text before comparing literals
-- =============================================================================
-- The previous migration (20260505000005_admin_stats.sql) left the function
-- created OK (plpgsql validates lazily) but failed at *call* time with:
--   ERROR: invalid input value for enum subscription_plan: "yearly"
-- because the MRR CASE compared the enum column against the string literal
-- 'yearly' which isn't a member of the current subscription_plan enum
-- (only free, monthly, quarterly, lifetime).
--
-- Fix: cast the column to text inside the CTE so the CASE matches against
-- strings, not enum values. Unknown plan strings now silently fall through
-- to ELSE 0 instead of failing the whole RPC. Forward-compat for adding
-- 'yearly' (or any new plan) to the enum without touching this function.
--
-- Idempotent — CREATE OR REPLACE swaps the body in place. Permissions and
-- the service-role grant from the prior migration are preserved.
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

  select jsonb_build_object(
    'signed_up',      count(*),
    'opened_studio',  count(*) filter (where p.trace_sessions > 0),
    'used_trial',     count(*) filter (where p.free_sessions_used > 0),
    'currently_paid', cardinality(v_paid_user_ids)
  )
    from public.profiles p
    into v_funnel;

  -- Cast plan to text in the CTE so CASE comparisons run on strings, not
  -- enum values. Without this, an unmatched literal ('yearly' below) blows
  -- up the whole RPC at call time.
  with active_recurring as (
    select plan::text as plan_label, amount_cents
      from public.subscriptions
     where status = 'active'
       and plan != 'free'
       and plan != 'lifetime'
       and amount_cents is not null
  )
  select jsonb_build_object(
    'mrr_cents', (
      select coalesce(sum(case
        when plan_label = 'monthly'   then amount_cents::numeric
        when plan_label = 'quarterly' then amount_cents::numeric / 3
        when plan_label = 'yearly'    then amount_cents::numeric / 12
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
