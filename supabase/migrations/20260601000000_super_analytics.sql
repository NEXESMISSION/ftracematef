-- =============================================================================
-- Trace Mate — "super analytics": anonymous visitor tracking + geo + heatmaps
-- =============================================================================
-- Everything before this migration only existed once a visitor had an ACCOUNT
-- (page_visits / presence / signup_source all key off profiles.id). A person
-- who landed on tracemate.art from a TikTok link, scrolled the hero, rage-
-- clicked a dead button and bounced left ZERO trace. This migration adds a
-- first-class anonymous analytics pipeline so the operator can see the whole
-- funnel from the very first paint — where they came from, what device /
-- country, how they dealt with the landing page — and stitch it to the account
-- if they eventually sign up.
--
-- THREE tables, all RLS-locked so NO browser role can read or write them
-- directly:
--   * analytics_visitors  — one row per stable client visitor_id (the spine).
--   * analytics_events     — the firehose (pageview / click / scroll / rage / …).
--   * analytics_ip_geo     — IP-hash → geo cache so we resolve each IP once.
--
-- Writes happen ONLY through the public `ingest-events` Edge Function running
-- as service_role (it hashes the IP + resolves geo server-side — the raw IP
-- never reaches the database). Reads happen ONLY through the security-definer
-- rollup RPCs at the bottom, called by the triple-gated `admin-analytics`
-- Edge Function. Same trust model as get_admin_stats().
-- =============================================================================

-- ── analytics_visitors ──────────────────────────────────────────────────────
-- The spine. One row per browser that ever hit the site, keyed by a client-
-- generated uuid persisted in localStorage. First-touch columns are written
-- once and never overwritten (matching signup_source semantics); counters and
-- last_seen_at are bumped on every batch. `user_id` is filled the moment the
-- visitor signs in, which is what stitches the anonymous pre-history onto the
-- eventual account.
create table if not exists public.analytics_visitors (
  visitor_id     uuid primary key,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  user_id        uuid references public.profiles(id) on delete set null,

  -- first-touch acquisition (never overwritten once set)
  source         text,
  campaign       text,
  affiliate      text,
  referrer       text,
  landing_path   text,

  -- first-seen device snapshot
  device_type    text,   -- 'mobile' | 'tablet' | 'desktop' | 'bot' | null
  os             text,
  browser        text,
  ua             text,
  lang           text,
  tz             text,

  -- first-seen geo (resolved server-side from the hashed IP)
  country        text,
  country_code   text,
  region         text,
  city           text,
  lat            double precision,
  lon            double precision,

  -- lifetime counters
  sessions       int not null default 0,
  events         int not null default 0,
  pageviews      int not null default 0
);

create index if not exists analytics_visitors_last_seen_idx
  on public.analytics_visitors (last_seen_at desc);
create index if not exists analytics_visitors_user_idx
  on public.analytics_visitors (user_id) where user_id is not null;
create index if not exists analytics_visitors_country_idx
  on public.analytics_visitors (country_code);
create index if not exists analytics_visitors_source_idx
  on public.analytics_visitors (source);

alter table public.analytics_visitors enable row level security;
-- No policies: only service_role (the ingest fn) and the security-definer
-- rollup RPCs touch this table. A browser never reads or writes it.

-- ── analytics_events ─────────────────────────────────────────────────────────
-- The firehose. Every meaningful interaction lands here. `props` holds the
-- event-specific payload so we don't grow a column per event type:
--   click   → { xpct, ypct, ypage, vw, sel, txt }   (xpct/ypct in 0..1)
--   scroll  → { depth }                              (max % reached: 25/50/75/100)
--   rage    → { xpct, ypct, count, sel }
--   section → { id }
--   custom  → { name, ... }
-- Geo + device are denormalised onto each row (cheap text) so the rollups
-- never have to join back to analytics_visitors for a country/device breakdown.
create table if not exists public.analytics_events (
  id            bigserial primary key,
  visitor_id    uuid not null,
  session_id    uuid not null,
  user_id       uuid,
  type          text not null,
  path          text,
  referrer      text,

  source        text,
  campaign      text,
  affiliate     text,

  device_type   text,
  os            text,
  browser       text,
  lang          text,
  tz            text,
  viewport_w    int,
  viewport_h    int,
  screen_w      int,
  screen_h      int,

  country       text,
  country_code  text,
  region        text,
  city          text,
  lat           double precision,
  lon           double precision,

  props         jsonb,
  created_at    timestamptz not null default now()
);

-- Time-ordered scan is the dominant access pattern (every rollup filters on a
-- created_at range first). The partial/compound indexes below keep the common
-- "events of type X on path Y in range" slices cheap without indexing the
-- whole firehose six ways.
create index if not exists analytics_events_created_idx
  on public.analytics_events (created_at desc);
create index if not exists analytics_events_type_created_idx
  on public.analytics_events (type, created_at desc);
create index if not exists analytics_events_path_type_idx
  on public.analytics_events (path, type, created_at desc);
create index if not exists analytics_events_visitor_idx
  on public.analytics_events (visitor_id, created_at desc);

alter table public.analytics_events enable row level security;
-- No policies — service_role + security-definer RPCs only.

-- ── analytics_ip_geo ─────────────────────────────────────────────────────────
-- IP-hash → geo cache. The ingest fn salts+hashes the client IP (raw IP is
-- NEVER persisted), looks the hash up here, and only calls the external geo
-- provider on a miss / stale row. A returning visitor's country is therefore
-- a single indexed read, not an outbound API call per event.
create table if not exists public.analytics_ip_geo (
  ip_hash       text primary key,
  country       text,
  country_code  text,
  region        text,
  city          text,
  lat           double precision,
  lon           double precision,
  resolved_at   timestamptz not null default now()
);

alter table public.analytics_ip_geo enable row level security;
-- No policies — service_role only.

-- ── ingest_analytics_batch ───────────────────────────────────────────────────
-- One round-trip per flush. The Edge Function hands us the resolved geo +
-- device snapshot (already validated/clamped in TS) plus a jsonb array of
-- events. We upsert the visitor (first-touch coalesce + counter bump) and bulk-
-- insert the events in a single function so a batch is atomic.
--
-- SECURITY DEFINER + granted to service_role ONLY. Even with a leaked anon key
-- a browser can't call this (no grant to anon/authenticated), and the ingest
-- fn is the sole caller.
create or replace function public.ingest_analytics_batch(
  p_visitor_id  uuid,
  p_session_id  uuid,
  p_user_id     uuid,
  p_geo         jsonb,    -- { country, country_code, region, city, lat, lon }
  p_device      jsonb,    -- { device_type, os, browser, ua, lang, tz, viewport_w, viewport_h, screen_w, screen_h }
  p_first_touch jsonb,    -- { source, campaign, affiliate, referrer, landing_path }
  p_events      jsonb     -- [ { type, path, referrer, props, ... }, ... ]
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

  -- The client stamps props.session_start = true on the first event of a new
  -- session_id. Count those so the visitor's lifetime session tally is correct
  -- on returning visits, not just the first.
  select count(*) into v_sessions
    from jsonb_array_elements(p_events) e
   where (e->'props'->>'session_start') = 'true';

  -- Upsert the visitor spine. First-touch columns use coalesce(existing, new)
  -- so they're written once and never clobbered; counters accumulate. We bump
  -- `sessions` only when this batch carries a session-start marker (a pageview
  -- whose props.session_start is true), set by the client on a new session_id.
  insert into public.analytics_visitors as v (
    visitor_id, first_seen_at, last_seen_at, user_id,
    source, campaign, affiliate, referrer, landing_path,
    device_type, os, browser, ua, lang, tz,
    country, country_code, region, city, lat, lon,
    sessions, events, pageviews
  ) values (
    p_visitor_id, now(), now(), p_user_id,
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

  -- Bulk-insert the events. Geo + device are denormalised from the batch-level
  -- snapshot onto every row so the rollups never join back.
  insert into public.analytics_events (
    visitor_id, session_id, user_id, type, path, referrer,
    source, campaign, affiliate,
    device_type, os, browser, lang, tz,
    viewport_w, viewport_h, screen_w, screen_h,
    country, country_code, region, city, lat, lon,
    props, created_at
  )
  select
    p_visitor_id, p_session_id, p_user_id,
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

revoke all    on function public.ingest_analytics_batch(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_analytics_batch(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb) to service_role;

-- ── get_analytics_overview ───────────────────────────────────────────────────
-- One jsonb blob powering the entire admin "Pulse" tab. Everything is bounded
-- by [p_from, p_to) so the created_at index does the heavy lifting. service_
-- role-only; the admin-analytics Edge Function is the sole caller.
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
  -- A visitor is "new" if their first_seen falls inside the window; otherwise
  -- they were already known → returning.
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
      -- signups whose visitor first appeared in-window (acquisition), measured
      -- via the stitched user_id on the visitor spine.
      'signups',   (select count(*) from public.analytics_visitors v
                     where v.user_id is not null and v.first_seen_at >= p_from and v.first_seen_at < p_to),
      'live',      (select count(distinct visitor_id) from public.analytics_events
                     where created_at > now() - interval '5 minutes')
    ),

    -- Globe + country table. avg(lat/lon) gives a usable per-country centroid
    -- from the city-level points we already store, so no centroid lookup table.
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

    -- Daily timeseries (visitors + pageviews) for the trend chart.
    'timeseries', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.day), '[]'::jsonb) from (
        select date_trunc('day', created_at) as day,
               count(distinct visitor_id) as visitors,
               count(*) filter (where type = 'pageview') as pageviews
          from ev group by 1
      ) t
    ),

    -- Acquisition funnel across ALL visitors first-seen in-window, joined to
    -- the account/subscription state they reached. Answers "of everyone who
    -- showed up this week, how many signed up and how many paid?"
    'funnel', (
      select jsonb_build_object(
        'visitors', count(*),
        'signups',  count(*) filter (where v.user_id is not null),
        -- "paid" = an active subscription on a non-free plan. Every signup gets
        -- an auto-created plan='free'/status='active' row (see init.sql), so we
        -- must exclude free explicitly or the whole funnel would read as paid.
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

-- ── get_heatmap ──────────────────────────────────────────────────────────────
-- Per-page interaction detail for the heatmap viewer: normalised click points
-- (capped so the payload stays bounded), the scroll-depth funnel, rage-click
-- hotspots, and the most-clicked elements (the actionable bit — pixel overlays
-- are pretty, "47 people clicked a div that isn't a link" is what fixes pages).
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
  with ev as (
    select * from public.analytics_events
     where path = p_path and created_at >= p_from and created_at < p_to
  )
  select jsonb_build_object(
    'path', p_path,
    'pageviews', (select count(*) from ev where type = 'pageview'),
    'clicks',    (select count(*) from ev where type = 'click'),

    -- Up to 3000 normalised click points for the canvas. Sampled newest-first;
    -- 3k blobs is plenty for a readable density map and keeps the JSON small.
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

    -- Scroll-depth funnel: how many sessions reached each milestone.
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

-- ── prune_analytics ──────────────────────────────────────────────────────────
-- Retention valve for a future cron. Raw events are the bulky part; 90 days is
-- plenty for funnel/heatmap analysis. Visitor spine rows are tiny (one per
-- browser) and forensically valuable, so we keep those longer (1 year of
-- inactivity). Returns the number of event rows deleted.
create or replace function public.prune_analytics(p_event_days int default 90)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  delete from public.analytics_events
   where created_at < now() - (p_event_days || ' days')::interval;
  get diagnostics v_deleted = row_count;

  delete from public.analytics_ip_geo
   where resolved_at < now() - interval '90 days';

  delete from public.analytics_visitors
   where last_seen_at < now() - interval '365 days' and user_id is null;

  return v_deleted;
end $$;

revoke all    on function public.prune_analytics(int) from public, anon, authenticated;
grant execute on function public.prune_analytics(int) to service_role;
