-- =============================================================================
-- Exclude specific operator-owned accounts from analytics (Pulse + downloads).
-- =============================================================================
-- The operator owns several accounts they use to test the live product (alt
-- emails, brand accounts). Only nexesmission@gmail.com is is_admin, so the
-- existing is_admin read-layer exclusion (20260603000000) didn't cover the rest
-- and their sessions were polluting the rollups + the registered-users export.
--
-- Rather than make every alt account an admin (which would grant /admin-me
-- access), we add a dedicated `profiles.exclude_from_analytics` flag and teach
-- the three read RPCs to drop those profiles too — alongside is_admin. Same
-- read-layer model: retroactive, self-correcting, no ingestion/privacy change,
-- function signatures unchanged (no admin-analytics redeploy needed).
-- =============================================================================

alter table public.profiles
  add column if not exists exclude_from_analytics boolean not null default false;

-- Flag the operator's own accounts. Idempotent; case-insensitive on email.
update public.profiles
   set exclude_from_analytics = true
 where lower(email) in (
   'saifelleuchi127@gmail.com',
   'quikasalami@gmail.com',
   'thefounderplaybook.on@gmail.com',
   'hi@tracemate.art',
   'nexesmission@gmail.com',
   'alemmar2tn@gmail.com'
 );

-- ── get_analytics_overview ───────────────────────────────────────────────────
-- Re-created from 20260603130000 (pwa + lifetime keys); only the `excluded` CTE
-- predicate changes: is_admin OR exclude_from_analytics.
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
        or coalesce(p.exclude_from_analytics, false) = true
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
    ),

    -- Lifetime "secret deal" funnel: teaser seen → unwrapped → claim clicked.
    'lifetime', (
      select jsonb_build_object(
        'teaser_views', count(distinct vkey) filter (where type = 'custom' and props->>'name' = 'lifetime_teaser_view'),
        'unwraps',      count(distinct vkey) filter (where type = 'custom' and props->>'name' = 'lifetime_unwrap'),
        'claims',       count(*)             filter (where type = 'custom' and props->>'name' = 'lifetime_claim')
      )
      from ev
    )
  )
  into result;

  return result;
end $$;

revoke all    on function public.get_analytics_overview(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_analytics_overview(timestamptz, timestamptz) to service_role;

-- ── get_heatmap ──────────────────────────────────────────────────────────────
-- Re-created from 20260603000000; only the `excluded` predicate changes.
create or replace function public.get_heatmap(
  p_path text,
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
        or coalesce(p.exclude_from_analytics, false) = true
  ),
  ev as (
    select * from public.analytics_events
     where path = p_path and created_at >= p_from and created_at < p_to
       and visitor_id not in (select visitor_id from excluded)
  )
  select jsonb_build_object(
    'path', p_path,
    'pageviews', (select count(*) from ev where type = 'pageview'),
    'clicks',    (select count(*) from ev where type = 'click'),

    'points', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'x', (props->>'xpct')::float,
               'y', (props->>'ypct')::float
             )), '[]'::jsonb)
      from (
        select props from ev
         where type = 'click' and props ? 'xpct' and props ? 'ypct'
         order by created_at desc limit 3000
      ) p
    ),

    'scroll', (
      select jsonb_build_object(
        'd25',  count(*) filter (where (props->>'depth')::int >= 25),
        'd50',  count(*) filter (where (props->>'depth')::int >= 50),
        'd75',  count(*) filter (where (props->>'depth')::int >= 75),
        'd100', count(*) filter (where (props->>'depth')::int >= 100)
      )
      from (
        select distinct on (session_id) session_id, props
          from ev where type = 'scroll' and props ? 'depth'
         order by session_id, (props->>'depth')::int desc
      ) s
    ),

    'rage', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select coalesce(nullif(props->>'sel',''), '(unknown)') as sel,
               count(*) as count
          from ev where type = 'rage' group by 1 order by count desc limit 20
      ) t
    ),

    'top_elements', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select coalesce(nullif(props->>'sel',''), '(unknown)') as sel,
               max(nullif(props->>'txt','')) as txt,
               count(*) as clicks
          from ev where type = 'click' group by 1 order by clicks desc limit 30
      ) t
    )
  )
  into result;

  return result;
end $$;

revoke all    on function public.get_heatmap(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_heatmap(text, timestamptz, timestamptz) to service_role;

-- ── list_visitors ────────────────────────────────────────────────────────────
-- Re-created from 20260603000000; drops admin AND exclude_from_analytics rows.
create or replace function public.list_visitors(
  p_from           timestamptz,
  p_to             timestamptz,
  p_limit          int     default 50,
  p_offset         int     default 0,
  p_only_signedup  boolean default false,
  p_search         text    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result   jsonb;
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_like   text := '%' || lower(coalesce(v_search, '')) || '%';
begin
  with base as (
    select
      v.*,
      pr.email        as email,
      pr.display_name as display_name,
      s.plan          as plan,
      s.status        as status,
      (v.user_id is not null) as signed_up,
      (s.status = 'active' and s.plan <> 'free') as paid,
      public.analytics_channel(v.source, v.referrer) as channel
    from public.analytics_visitors v
    left join public.profiles pr on pr.id = v.user_id
    left join public.subscriptions s on s.user_id = v.user_id
    where v.last_seen_at >= p_from
      and v.first_seen_at < p_to
      and coalesce(pr.is_admin, false) = false                -- exclude admin traffic
      and coalesce(pr.exclude_from_analytics, false) = false  -- exclude operator-owned accounts
      and (not p_only_signedup or v.user_id is not null)
      and (
        v_search is null
        or lower(coalesce(pr.email,''))        like v_like
        or lower(coalesce(pr.display_name,'')) like v_like
        or lower(coalesce(v.city,''))          like v_like
        or lower(coalesce(v.country,''))       like v_like
        or lower(coalesce(v.source,''))        like v_like
        or lower(coalesce(v.referrer,''))      like v_like
        or v.visitor_id::text                  like v_like
      )
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'rows', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select
          visitor_id, first_seen_at, last_seen_at,
          channel, source, referrer, landing_path,
          country, country_code, city,
          device_type, os, browser,
          sessions, events, pageviews,
          user_id, email, display_name, plan, status,
          signed_up, paid
        from base
        order by last_seen_at desc
        limit v_limit offset v_offset
      ) t
    )
  )
  into result;

  return result;
end $$;

revoke all    on function public.list_visitors(timestamptz, timestamptz, int, int, boolean, text) from public, anon, authenticated;
grant execute on function public.list_visitors(timestamptz, timestamptz, int, int, boolean, text) to service_role;
