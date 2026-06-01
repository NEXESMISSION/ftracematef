-- =============================================================================
-- Add a real "Referrers" breakdown to the analytics overview.
-- =============================================================================
-- The original overview only surfaced `by_source` — the marketing slug we
-- control (tracemate.art/r/:source, /tiktok, …). That's blank for organic
-- traffic. The operator also wants to know where UNTAGGED visitors came from,
-- which lives in document.referrer (already stored on every event).
--
-- This replaces get_analytics_overview() with an identical body PLUS a
-- `by_referrer` field that groups events by the referrer's HOST (google.com,
-- t.co, com.google.android.gm for Gmail, …) so "where exactly did they come
-- from?" has a direct answer. Empty/missing referrer → '(direct)'; a leading
-- www. is stripped so www.google.com and google.com collapse together.
-- =============================================================================

create or replace function public.get_analytics_overview(
  p_from timestamptz,
  p_to   timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  with ev as (
    select * from public.analytics_events
     where created_at >= p_from and created_at < p_to
  ),
  vis as (
    select distinct visitor_id from ev
  ),
  sess as (
    select distinct session_id from ev
  ),
  newret as (
    select
      count(*) filter (where v.first_seen_at >= p_from) as new_visitors,
      count(*) filter (where v.first_seen_at <  p_from) as returning_visitors
    from public.analytics_visitors v
    where v.visitor_id in (select visitor_id from vis)
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),

    'totals', jsonb_build_object(
      'visitors',  (select count(*) from vis),
      'sessions',  (select count(*) from sess),
      'pageviews', (select count(*) from ev where type = 'pageview'),
      'events',    (select count(*) from ev),
      'new_visitors',       (select new_visitors       from newret),
      'returning_visitors', (select returning_visitors from newret),
      'signups',   (select count(*) from public.analytics_visitors v
                     where v.user_id is not null and v.first_seen_at >= p_from and v.first_seen_at < p_to),
      'live',      (select count(distinct visitor_id) from public.analytics_events
                     where created_at > now() - interval '5 minutes')
    ),

    'by_country', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select country_code, max(country) as country,
               count(distinct visitor_id) as visitors,
               avg(lat) as lat, avg(lon) as lon
          from ev where country_code is not null
         group by country_code
         order by visitors desc
         limit 200
      ) t
    ),

    'by_source', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select coalesce(nullif(source,''), '(direct)') as source,
               count(distinct visitor_id) as visitors
          from ev group by 1 order by visitors desc limit 30
      ) t
    ),

    -- NEW: where untagged visitors actually came from (referrer host).
    'by_referrer', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select coalesce(
                 nullif(
                   regexp_replace(
                     substring(referrer from '^[a-z][a-z0-9+.-]*://([^/?#]+)'),
                     '^www\.', ''
                   ), ''),
                 '(direct)'
               ) as referrer,
               count(distinct visitor_id) as visitors
          from ev group by 1 order by visitors desc limit 40
      ) t
    ),

    'by_device', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select coalesce(nullif(device_type,''), 'unknown') as device_type,
               count(distinct visitor_id) as visitors
          from ev group by 1 order by visitors desc
      ) t
    ),
    'by_os', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select coalesce(nullif(os,''), 'unknown') as os,
               count(distinct visitor_id) as visitors
          from ev group by 1 order by visitors desc limit 20
      ) t
    ),
    'by_browser', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select coalesce(nullif(browser,''), 'unknown') as browser,
               count(distinct visitor_id) as visitors
          from ev group by 1 order by visitors desc limit 20
      ) t
    ),
    'by_language', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select coalesce(nullif(lang,''), 'unknown') as lang,
               count(distinct visitor_id) as visitors
          from ev group by 1 order by visitors desc limit 20
      ) t
    ),
    'by_page', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select coalesce(nullif(path,''), '/') as path,
               count(*)                  as views,
               count(distinct visitor_id) as visitors
          from ev where type = 'pageview' group by 1 order by views desc limit 40
      ) t
    ),

    'timeseries', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.day), '[]'::jsonb) from (
        select date_trunc('day', created_at) as day,
               count(distinct visitor_id) as visitors,
               count(*) filter (where type = 'pageview') as pageviews
          from ev group by 1
      ) t
    ),

    'funnel', (
      select jsonb_build_object(
        'visitors', count(*),
        'signups',  count(*) filter (where v.user_id is not null),
        'paid',     count(*) filter (where s.status = 'active' and s.plan <> 'free')
      )
      from public.analytics_visitors v
      left join public.subscriptions s on s.user_id = v.user_id
      where v.first_seen_at >= p_from and v.first_seen_at < p_to
    )
  )
  into result;

  return result;
end $$;

revoke all    on function public.get_analytics_overview(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_analytics_overview(timestamptz, timestamptz) to service_role;
