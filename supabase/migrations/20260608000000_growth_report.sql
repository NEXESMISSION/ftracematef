-- =============================================================================
-- Growth Report — a smarter, periodic operator snapshot + weekly email digest.
-- =============================================================================
-- One RPC that rolls up the numbers an operator actually steers by: period
-- signups / paid / revenue, the visitor→signup→paid conversion funnel, and —
-- the genuinely new bit — per-acquisition-source ROI (which channels produce
-- not just signups but PAID, REVENUE-generating customers). Plus a survey +
-- traced-image snapshot. Operator-owned accounts (is_admin / exclude_from_
-- analytics) are dropped so the numbers reflect real users only.
--
-- notify_growth_report() posts this to the existing notify-operator Resend pipe
-- (same notify_settings() + x-notify-secret pattern as notify_daily_digest),
-- scheduled weekly. So the operator "tracks better" passively, by inbox.
-- =============================================================================

create or replace function public.get_growth_report(p_days int default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days  int := greatest(coalesce(p_days, 7), 1);
  v_since timestamptz := now() - (v_days || ' days')::interval;
  result  jsonb;
begin
  with real_profiles as (
    select * from public.profiles
     where coalesce(is_admin, false) = false
       and coalesce(exclude_from_analytics, false) = false
  ),
  active_paid as (
    select s.user_id, s.plan, s.amount_cents, s.created_at
      from public.subscriptions s
      join real_profiles p on p.id = s.user_id
     where s.status = 'active' and s.plan <> 'free'
  )
  select jsonb_build_object(
    'period', jsonb_build_object('days', v_days, 'since', v_since),
    'kpis', jsonb_build_object(
      'signups_period',       (select count(*) from real_profiles where created_at >= v_since),
      'paid_period',          (select count(*) from active_paid   where created_at >= v_since),
      'revenue_cents_period', (select coalesce(sum(amount_cents), 0) from active_paid where created_at >= v_since),
      'active_users_period',  (select count(*) from real_profiles where last_seen_at >= v_since),
      'new_visitors_period',  (select count(*) from public.analytics_visitors where first_seen_at >= v_since),
      'total_users',          (select count(*) from real_profiles),
      'total_paying',         (select count(*) from active_paid),
      -- Monthly-recurring-revenue estimate: monthly at face value, quarterly
      -- amortized /3. Lifetime is one-time so excluded from MRR. Currencies are
      -- summed nominally (good enough for a directional weekly read).
      'mrr_cents',            (select coalesce(sum(
                                 case when plan = 'monthly'   then amount_cents
                                      when plan = 'quarterly' then amount_cents / 3
                                      else 0 end), 0) from active_paid)
    ),
    'funnel', (
      select jsonb_build_object(
        'visitors', v, 'signups', s, 'paid', pd,
        'signup_rate_pct', case when v > 0 then round(100.0 * s  / v, 1) else 0 end,
        'paid_rate_pct',   case when s > 0 then round(100.0 * pd / s, 1) else 0 end
      )
      from (select
        (select count(*) from public.analytics_visitors) v,
        (select count(*) from real_profiles)             s,
        (select count(*) from active_paid)               pd
      ) f
    ),
    -- Per-source ROI: signups, paid conversions, and REVENUE by acquisition
    -- source. The lever for "which channels actually make money", not just
    -- which bring signups.
    'source_roi', (
      select coalesce(jsonb_agg(row_to_json(x) order by x.revenue_cents desc, x.signups desc), '[]'::jsonb)
      from (
        select
          coalesce(nullif(trim(rp.signup_source), ''), '(direct / unknown)') as source,
          count(*)                                          as signups,
          count(ap.user_id)                                 as paid,
          coalesce(sum(ap.amount_cents), 0)::bigint         as revenue_cents
        from real_profiles rp
        left join active_paid ap on ap.user_id = rp.id
        group by 1
      ) x
    ),
    'survey', jsonb_build_object(
      'respondents', (select count(*) from real_profiles where survey_completed_at is not null),
      'top_age',     (select survey_age from real_profiles
                       where survey_age is not null
                       group by survey_age order by count(*) desc limit 1)
    ),
    'traced', jsonb_build_object(
      'total', (select count(*) from public.traced_images)
    )
  ) into result;

  return result;
end $$;

revoke all    on function public.get_growth_report(int) from public, anon, authenticated;
grant execute on function public.get_growth_report(int) to service_role;

-- ── Weekly email digest ──────────────────────────────────────────────────────
-- Posts the 7-day report to the notify-operator Edge Function (Resend), same
-- shape/secret as notify_daily_digest. notify-operator renders the email.
create or replace function public.notify_growth_report()
returns void
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_url    text;
  v_secret text;
  v_report jsonb;
begin
  select fn_url, fn_secret into v_url, v_secret from public.notify_settings();
  if v_url is null or v_url = '' then return; end if;

  v_report := public.get_growth_report(7);

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',    'application/json',
      'x-notify-secret', coalesce(v_secret, '')
    ),
    body    := jsonb_build_object(
      'event',  'growth_report',
      'report', v_report
    )
  );
end $$;

revoke all on function public.notify_growth_report() from public;

-- ── Schedule weekly: Monday 08:00 UTC ────────────────────────────────────────
do $$
begin
  perform cron.unschedule('notify-growth-report');
exception when others then null;
end $$;

do $$
begin
  perform cron.schedule(
    'notify-growth-report',
    '0 8 * * 1',
    $cron$ select public.notify_growth_report(); $cron$
  );
exception when others then
  raise notice 'pg_cron schedule failed (continuing without weekly growth report): %', sqlerrm;
end $$;
