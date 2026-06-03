-- =============================================================================
-- PWA install funnel in the analytics overview.
-- =============================================================================
-- The account page gained a floating "Install app" promo, and the client now
-- emits the whole install journey as `custom` events (props.name = pwa_*):
--   pwa_standalone, pwa_promo_open, pwa_pick_ios, pwa_pick_android,
--   pwa_prompt_available, pwa_prompt_accepted, pwa_prompt_dismissed, pwa_installed
--
-- This re-creates get_analytics_overview (built on 20260603000000, which excludes
-- admin-stitched traffic) with one added top-level key, `pwa`, rolling those
-- events up for the Pulse "App installs" card. The function SIGNATURE is
-- unchanged, so the admin-analytics Edge Function needs no redeploy — the extra
-- key flows straight through to overview.pwa. Ingestion is unchanged too: the
-- public endpoint already accepts `custom` events and whitelists props.name.
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
  with excluded as (
    select v.visitor_id
      from public.analytics_visitors v
      join public.profiles p on p.id = v.user_id
     where p.is_admin = true
  ),
  ev as (
    select *, coalesce(nullif(device_key,''), visitor_id::text) as vkey
      from public.analytics_events
     where created_at >= p_from and created_at < p_to
       and visitor_id not in (select visitor_id from excluded)
  ),
  vis as (select distinct vkey from ev),
  sess as (select distinct session_id from ev),
  newret as (
    select
      count(*) filter (where mn >= p_from) as new_visitors,
      count(*) filter (where mn <  p_from) as returning_visitors
    from (
      select coalesce(nullif(v.device_key,''), v.visitor_id::text) as vkey,
             min(v.first_seen_at) as mn
        from public.analytics_visitors v
        join (select distinct visitor_id from ev) x on x.visitor_id = v.visitor_id
       group by 1
    ) g
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
      'signups',   (select count(distinct coalesce(nullif(device_key,''), visitor_id::text))
                      from public.analytics_visitors v
                     where v.user_id is not null
                       and v.first_seen_at >= p_from and v.first_seen_at < p_to
                       and v.visitor_id not in (select visitor_id from excluded)),
      'live',      (select count(distinct coalesce(nullif(device_key,''), visitor_id::text))
                      from public.analytics_events
                     where created_at > now() - interval '5 minutes'
                       and visitor_id not in (select visitor_id from excluded))
    ),

    'by_country', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select country_code, max(country) as country,
               count(distinct vkey) as visitors,
               avg(lat) as lat, avg(lon) as lon
          from ev where country_code is not null
         group by country_code order by visitors desc limit 200
      ) t
    ),

    'by_channel', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select public.analytics_channel(source, referrer) as channel,
               count(distinct vkey) as visitors
          from ev group by 1 order by visitors desc limit 40
      ) t
    ),
    'by_source', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select coalesce(nullif(source,''), '(direct)') as source,
               count(distinct vkey) as visitors
          from ev group by 1 order by visitors desc limit 30
      ) t
    ),
    'by_referrer', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select coalesce(
                 nullif(regexp_replace(
                   substring(referrer from '^[a-z][a-z0-9+.-]*://([^/?#]+)'),
                   '^www\.', ''), ''),
                 '(direct)') as referrer,
               count(distinct vkey) as visitors
          from ev group by 1 order by visitors desc limit 40
      ) t
    ),
    'by_device', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select coalesce(nullif(device_type,''), 'unknown') as device_type,
               count(distinct vkey) as visitors
          from ev group by 1 order by visitors desc
      ) t
    ),
    'by_os', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select coalesce(nullif(os,''), 'unknown') as os,
               count(distinct vkey) as visitors
          from ev group by 1 order by visitors desc limit 20
      ) t
    ),
    'by_browser', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select coalesce(nullif(browser,''), 'unknown') as browser,
               count(distinct vkey) as visitors
          from ev group by 1 order by visitors desc limit 20
      ) t
    ),
    'by_language', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select coalesce(nullif(lang,''), 'unknown') as lang,
               count(distinct vkey) as visitors
          from ev group by 1 order by visitors desc limit 20
      ) t
    ),
    'by_page', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select coalesce(nullif(path,''), '/') as path,
               count(*) as views,
               count(distinct vkey) as visitors
          from ev where type = 'pageview' group by 1 order by views desc limit 40
      ) t
    ),

    'timeseries', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.day), '[]'::jsonb) from (
        select date_trunc('day', created_at) as day,
               count(distinct vkey) as visitors,
               count(*) filter (where type = 'pageview') as pageviews
          from ev group by 1
      ) t
    ),

    'funnel', (
      select jsonb_build_object(
        'visitors', count(distinct g.vkey),
        'signups',  count(distinct g.vkey) filter (where g.user_id is not null),
        'paid',     count(distinct g.vkey) filter (where g.status = 'active' and g.plan <> 'free')
      )
      from (
        select coalesce(nullif(v.device_key,''), v.visitor_id::text) as vkey,
               v.user_id, s.status, s.plan
          from public.analytics_visitors v
          left join public.subscriptions s on s.user_id = v.user_id
         where v.first_seen_at >= p_from and v.first_seen_at < p_to
           and v.visitor_id not in (select visitor_id from excluded)
      ) g
    ),

    -- PWA install funnel. All steps are `custom` events keyed by props.name.
    -- Counts are raw event totals except standalone, which is de-duped to
    -- distinct devices (one row per load would otherwise inflate "uses the app").
    'pwa', (
      select jsonb_build_object(
        'promo_open',          count(*) filter (where type = 'custom' and props->>'name' = 'pwa_promo_open'),
        'pick_ios',            count(*) filter (where type = 'custom' and props->>'name' = 'pwa_pick_ios'),
        'pick_android',        count(*) filter (where type = 'custom' and props->>'name' = 'pwa_pick_android'),
        'prompt_available',    count(*) filter (where type = 'custom' and props->>'name' = 'pwa_prompt_available'),
        'prompt_accepted',     count(*) filter (where type = 'custom' and props->>'name' = 'pwa_prompt_accepted'),
        'prompt_dismissed',    count(*) filter (where type = 'custom' and props->>'name' = 'pwa_prompt_dismissed'),
        'installed',           count(*) filter (where type = 'custom' and props->>'name' = 'pwa_installed'),
        'standalone_visitors', count(distinct vkey) filter (where type = 'custom' and props->>'name' = 'pwa_standalone')
      )
      from ev
    )
  )
  into result;

  return result;
end $$;

revoke all    on function public.get_analytics_overview(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_analytics_overview(timestamptz, timestamptz) to service_role;
