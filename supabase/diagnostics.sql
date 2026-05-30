-- =============================================================================
-- TraceMate — diagnostic SQL.
-- Paste each numbered block one at a time in Supabase → SQL Editor.
-- Goal: answer "why aren't users converting?" with real data, not GoatCounter.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1) THE BIG PICTURE — one row, all the headline numbers.
-- ─────────────────────────────────────────────────────────────────────────────
select
  (select count(*) from public.profiles)                                               as total_users,
  (select count(*) from public.profiles where free_sessions_used > 0)                  as users_who_started_trial,
  (select count(*) from public.profiles where trace_sessions > 0)                      as users_who_traced,
  (select count(*) from public.profiles where total_trace_seconds >= 60)               as users_who_traced_60s_plus,
  (select count(*) from public.subscriptions where plan <> 'free' and status = 'active') as paid_users,
  (select coalesce(sum(amount_cents),0)/100.0 from public.subscriptions
     where plan <> 'free' and status = 'active')                                       as revenue_usd,
  (select count(*) from public.profiles where last_seen_at > now() - interval '24 hours') as active_24h,
  (select count(*) from public.profiles where last_seen_at > now() - interval '7 days')   as active_7d;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2) THE FUNNEL — every drop-off step in one table.
--    Tells you exactly where you're losing people.
-- ─────────────────────────────────────────────────────────────────────────────
with f as (
  select
    count(*)                                          as signed_up,
    count(*) filter (where p.free_sessions_used > 0)  as opened_studio,
    count(*) filter (where p.trace_sessions > 0)      as traced_once,
    count(*) filter (where p.trace_sessions >= 2)     as traced_twice,
    count(*) filter (where p.total_trace_seconds >= 300) as traced_5min_plus,
    count(*) filter (where exists (
      select 1 from public.subscriptions s
      where s.user_id = p.id and s.plan <> 'free' and s.status = 'active'
    )) as paid
  from public.profiles p
)
select
  signed_up,
  opened_studio,
  traced_once,
  traced_twice,
  traced_5min_plus,
  paid,
  round(100.0 * opened_studio    / nullif(signed_up,0), 1) as pct_opened_studio,
  round(100.0 * traced_once      / nullif(signed_up,0), 1) as pct_traced_once,
  round(100.0 * traced_5min_plus / nullif(signed_up,0), 1) as pct_traced_5min_plus,
  round(100.0 * paid             / nullif(signed_up,0), 1) as pct_paid
from f;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3) DAILY SIGNUPS vs DAILY TRACERS — last 14 days.
--    See if traffic is growing and whether usage follows it.
-- ─────────────────────────────────────────────────────────────────────────────
with days as (
  select generate_series(
    (now() - interval '13 days')::date,
    now()::date,
    interval '1 day'
  )::date as d
)
select
  d                                                                                            as day,
  (select count(*) from public.profiles p where p.created_at::date = d)                        as signups,
  (select count(distinct r.user_id) from public.trace_session_runs r where r.started_at::date = d) as people_who_traced,
  (select count(*) from public.trace_session_runs r where r.started_at::date = d)              as total_sessions,
  (select count(*) from public.subscriptions s
     where s.created_at::date = d and s.plan <> 'free' and s.status = 'active')                as paid_conversions
from days
order by day desc;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4) WHO ACTUALLY USED THE APP — top tracers, regardless of paying.
--    If this list is full of people who traced 10+ minutes and didn't pay,
--    your paywall isn't firing or the free tier is too generous.
-- ─────────────────────────────────────────────────────────────────────────────
select
  p.email,
  p.display_name,
  p.trace_sessions                                       as sessions,
  p.total_trace_seconds                                  as total_seconds,
  round(p.total_trace_seconds / 60.0, 1)                 as total_minutes,
  p.free_sessions_used                                   as free_used,
  p.first_trace_at,
  p.last_trace_at,
  s.plan                                                 as plan,
  s.status                                               as sub_status
from public.profiles p
left join public.subscriptions s
  on s.user_id = p.id and s.status = 'active'
where p.trace_sessions > 0
order by p.total_trace_seconds desc
limit 50;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5) THE SILENT MAJORITY — signed up but never traced.
--    These users churned at first impression. Worth a "what stopped you?" email.
-- ─────────────────────────────────────────────────────────────────────────────
select
  p.email,
  p.display_name,
  p.created_at,
  p.last_seen_at,
  age(now(), p.created_at)                               as time_since_signup,
  case when p.last_seen_at is null then 'never returned'
       else age(now(), p.last_seen_at)::text             end as time_since_last_seen
from public.profiles p
where p.trace_sessions = 0
  and p.free_sessions_used = 0
order by p.created_at desc
limit 100;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6) USERS WHO HIT THE FREE-TRIAL CAP — these are your hottest leads.
--    They tried it, used both free sessions, didn't pay. Why?
-- ─────────────────────────────────────────────────────────────────────────────
select
  p.email,
  p.display_name,
  p.free_sessions_used,
  p.trace_sessions,
  round(p.total_trace_seconds / 60.0, 1)  as total_minutes,
  p.last_trace_at,
  age(now(), p.last_trace_at)             as time_since_last_trace,
  s.plan                                  as plan
from public.profiles p
left join public.subscriptions s
  on s.user_id = p.id and s.status = 'active'
where p.free_sessions_used >= 2
  and (s.plan = 'free' or s.plan is null)
order by p.last_trace_at desc nulls last;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7) SESSION LENGTH HISTOGRAM — how long do people actually trace?
--    Short = bounced / didn't get it. Long = engaged. Tells you product fit.
-- ─────────────────────────────────────────────────────────────────────────────
select
  case
    when duration_seconds is null              then 'still open'
    when duration_seconds <  10                then 'a) <10s (bounce)'
    when duration_seconds <  30                then 'b) 10–30s'
    when duration_seconds <  60                then 'c) 30–60s'
    when duration_seconds <  300               then 'd) 1–5min'
    when duration_seconds <  900               then 'e) 5–15min'
    when duration_seconds <  1800              then 'f) 15–30min'
    else                                            'g) 30min+'
  end                                          as bucket,
  count(*)                                     as sessions,
  count(distinct user_id)                      as distinct_users,
  round(avg(duration_seconds))                 as avg_seconds,
  string_agg(distinct closed_reason, ', ')     as close_reasons
from public.trace_session_runs
group by 1
order by 1;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8) WHAT ARE THEY ACTUALLY TRACING — top image labels.
--    Useful for marketing copy ("most traced: anime characters, logos…").
-- ─────────────────────────────────────────────────────────────────────────────
select
  coalesce(image_label, '(no label)')          as image,
  count(*)                                     as times_traced,
  count(distinct user_id)                      as distinct_users,
  round(avg(duration_seconds))                 as avg_seconds
from public.trace_session_runs
where started_at > now() - interval '30 days'
group by 1
order by times_traced desc
limit 30;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9) PAID USERS — who they are, what they paid, when.
-- ─────────────────────────────────────────────────────────────────────────────
select
  p.email,
  p.display_name,
  s.plan,
  s.status,
  s.amount_cents / 100.0  as amount_usd,
  s.currency,
  s.created_at            as paid_at,
  s.current_period_end,
  s.cancel_at_next_billing_date,
  p.trace_sessions,
  round(p.total_trace_seconds / 60.0, 1) as total_minutes
from public.subscriptions s
join public.profiles p on p.id = s.user_id
where s.plan <> 'free'
order by s.created_at desc;


-- ─────────────────────────────────────────────────────────────────────────────
-- 10) PAYMENT WEBHOOK HEALTH — are checkouts failing silently?
--     If you see lots of "checkout.session.completed" without matching
--     "subscription.active" rows, payments are arriving but not activating.
-- ─────────────────────────────────────────────────────────────────────────────
select
  event_type,
  processed,
  count(*)                          as events,
  min(created_at)                   as first_seen,
  max(created_at)                   as last_seen
from public.webhook_events
group by event_type, processed
order by events desc;

-- 10b) Recent failed/unprocessed webhook events with errors:
select id, event_type, processed, attempts, error_message, created_at
from public.webhook_events
where processed = false or error_message is not null
order by created_at desc
limit 20;


-- ─────────────────────────────────────────────────────────────────────────────
-- 11) THE "GOT VALUE BUT DIDN'T PAY" REPORT — your action list.
--     Power users on free who probably should have converted by now.
-- ─────────────────────────────────────────────────────────────────────────────
select
  p.email,
  p.display_name,
  p.trace_sessions,
  round(p.total_trace_seconds / 60.0, 1) as total_minutes,
  p.first_trace_at,
  p.last_trace_at,
  age(now(), p.first_trace_at)           as days_using
from public.profiles p
left join public.subscriptions s
  on s.user_id = p.id and s.status = 'active' and s.plan <> 'free'
where p.total_trace_seconds >= 300       -- traced 5+ minutes total
  and s.id is null                       -- never paid
order by p.total_trace_seconds desc;


-- ─────────────────────────────────────────────────────────────────────────────
-- 12) RETENTION — of users who traced day 0, how many came back day 1, 3, 7?
--     Brutal but honest cohort look. Low day-1 = first-trace experience is meh.
-- ─────────────────────────────────────────────────────────────────────────────
with first_trace as (
  select user_id, min(started_at::date) as d0
  from public.trace_session_runs
  group by user_id
),
returns as (
  select
    f.user_id,
    f.d0,
    bool_or(r.started_at::date = f.d0 + 1) as returned_d1,
    bool_or(r.started_at::date between f.d0 + 2 and f.d0 + 3) as returned_d3,
    bool_or(r.started_at::date between f.d0 + 4 and f.d0 + 7) as returned_d7
  from first_trace f
  join public.trace_session_runs r on r.user_id = f.user_id
  group by f.user_id, f.d0
)
select
  count(*)                                                    as cohort_size,
  count(*) filter (where returned_d1)                         as came_back_d1,
  count(*) filter (where returned_d3)                         as came_back_d3,
  count(*) filter (where returned_d7)                         as came_back_d7,
  round(100.0 * count(*) filter (where returned_d1) / count(*), 1) as pct_d1,
  round(100.0 * count(*) filter (where returned_d3) / count(*), 1) as pct_d3,
  round(100.0 * count(*) filter (where returned_d7) / count(*), 1) as pct_d7
from returns;
