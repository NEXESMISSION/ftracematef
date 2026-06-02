-- =============================================================================
-- Device-level dedup — stop counting the same machine as multiple visitors.
-- =============================================================================
-- A visitor was identified only by a random localStorage uuid (visitor_id).
-- That's stable for a normal returning user, but incognito, a cleared cache, or
-- a second browser on the SAME device each mint a fresh uuid — so one machine
-- inflates the visitor count. (Classic symptom: "1 visitor" in totals but "6"
-- in the funnel because the two used different keys.)
--
-- Fix: the ingest function now also computes a privacy-preserving DEVICE KEY =
-- hash(already-hashed-IP + user-agent). It's deterministic for a given
-- device+network, so refreshes / incognito / cleared storage on the same
-- machine collapse to ONE device. We store it on every event + the visitor
-- spine and count DISTINCT device key everywhere (falling back to visitor_id
-- when no key could be derived — e.g. a private/LAN IP — so unknowns aren't all
-- merged into one).
--
-- Trade-off (intentional, standard for privacy analytics): two different people
-- behind the same NAT with the same browser collapse into one. For a small
-- product that's the right side of the accuracy/over-count line.
-- =============================================================================

alter table public.analytics_visitors add column if not exists device_key text;
alter table public.analytics_events   add column if not exists device_key text;

create index if not exists analytics_visitors_device_idx
  on public.analytics_visitors (device_key) where device_key is not null;
create index if not exists analytics_events_device_idx
  on public.analytics_events (device_key) where device_key is not null;

-- ── ingest_analytics_batch (add p_device_key) ───────────────────────────────
-- Signature change → drop the old 7-arg version first (Postgres keeps both
-- otherwise and calls become ambiguous).
drop function if exists public.ingest_analytics_batch(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb);

create or replace function public.ingest_analytics_batch(
  p_visitor_id  uuid,
  p_session_id  uuid,
  p_user_id     uuid,
  p_device_key  text,
  p_geo         jsonb,
  p_device      jsonb,
  p_first_touch jsonb,
  p_events      jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pageviews int;
  v_count     int;
  v_sessions  int;
begin
  if p_visitor_id is null or p_session_id is null then return; end if;

  v_count := coalesce(jsonb_array_length(p_events), 0);
  if v_count = 0 then return; end if;

  select count(*) into v_pageviews
    from jsonb_array_elements(p_events) e
   where e->>'type' = 'pageview';

  select count(*) into v_sessions
    from jsonb_array_elements(p_events) e
   where (e->'props'->>'session_start') = 'true';

  insert into public.analytics_visitors as v (
    visitor_id, first_seen_at, last_seen_at, user_id, device_key,
    source, campaign, affiliate, referrer, landing_path,
    device_type, os, browser, ua, lang, tz,
    country, country_code, region, city, lat, lon,
    sessions, events, pageviews
  ) values (
    p_visitor_id, now(), now(), p_user_id, nullif(p_device_key,''),
    p_first_touch->>'source', p_first_touch->>'campaign', p_first_touch->>'affiliate',
    left(coalesce(p_first_touch->>'referrer',''), 500), left(coalesce(p_first_touch->>'landing_path',''), 120),
    p_device->>'device_type', p_device->>'os', p_device->>'browser', left(coalesce(p_device->>'ua',''), 400),
    p_device->>'lang', p_device->>'tz',
    p_geo->>'country', p_geo->>'country_code', p_geo->>'region', p_geo->>'city',
    (p_geo->>'lat')::double precision, (p_geo->>'lon')::double precision,
    greatest(v_sessions, 1), v_count, v_pageviews
  )
  on conflict (visitor_id) do update set
    last_seen_at = now(),
    sessions     = v.sessions + v_sessions,
    user_id      = coalesce(v.user_id, excluded.user_id),
    device_key   = coalesce(v.device_key, excluded.device_key),
    source       = coalesce(v.source, excluded.source),
    campaign     = coalesce(v.campaign, excluded.campaign),
    affiliate    = coalesce(v.affiliate, excluded.affiliate),
    referrer     = coalesce(v.referrer, excluded.referrer),
    landing_path = coalesce(v.landing_path, excluded.landing_path),
    device_type  = coalesce(v.device_type, excluded.device_type),
    os           = coalesce(v.os, excluded.os),
    browser      = coalesce(v.browser, excluded.browser),
    ua           = coalesce(v.ua, excluded.ua),
    lang         = coalesce(v.lang, excluded.lang),
    tz           = coalesce(v.tz, excluded.tz),
    country      = coalesce(v.country, excluded.country),
    country_code = coalesce(v.country_code, excluded.country_code),
    region       = coalesce(v.region, excluded.region),
    city         = coalesce(v.city, excluded.city),
    lat          = coalesce(v.lat, excluded.lat),
    lon          = coalesce(v.lon, excluded.lon),
    events       = v.events + v_count,
    pageviews    = v.pageviews + v_pageviews;

  insert into public.analytics_events (
    visitor_id, session_id, user_id, device_key, type, path, referrer,
    source, campaign, affiliate,
    device_type, os, browser, lang, tz,
    viewport_w, viewport_h, screen_w, screen_h,
    country, country_code, region, city, lat, lon,
    props, created_at
  )
  select
    p_visitor_id, p_session_id, p_user_id, nullif(p_device_key,''),
    left(coalesce(e->>'type',''), 24),
    left(coalesce(e->>'path',''), 120),
    left(coalesce(e->>'referrer',''), 500),
    p_first_touch->>'source', p_first_touch->>'campaign', p_first_touch->>'affiliate',
    p_device->>'device_type', p_device->>'os', p_device->>'browser',
    p_device->>'lang', p_device->>'tz',
    nullif((p_device->>'viewport_w'),'')::int, nullif((p_device->>'viewport_h'),'')::int,
    nullif((p_device->>'screen_w'),'')::int,   nullif((p_device->>'screen_h'),'')::int,
    p_geo->>'country', p_geo->>'country_code', p_geo->>'region', p_geo->>'city',
    (p_geo->>'lat')::double precision, (p_geo->>'lon')::double precision,
    e->'props',
    now()
  from jsonb_array_elements(p_events) e;
end $$;

revoke all    on function public.ingest_analytics_batch(uuid, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_analytics_batch(uuid, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb) to service_role;

-- ── get_analytics_overview — count DISTINCT device, not distinct uuid ────────
-- The visitor measure is now count(distinct coalesce(device_key, visitor_id)).
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
    select *, coalesce(nullif(device_key,''), visitor_id::text) as vkey
      from public.analytics_events
     where created_at >= p_from and created_at < p_to
  ),
  vis as (select distinct vkey from ev),
  sess as (select distinct session_id from ev),
  -- new vs returning, measured at device granularity
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
                     where v.user_id is not null and v.first_seen_at >= p_from and v.first_seen_at < p_to),
      'live',      (select count(distinct coalesce(nullif(device_key,''), visitor_id::text))
                      from public.analytics_events
                     where created_at > now() - interval '5 minutes')
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
      ) g
    )
  )
  into result;

  return result;
end $$;

revoke all    on function public.get_analytics_overview(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_analytics_overview(timestamptz, timestamptz) to service_role;
