-- =============================================================================
-- Channel classification — turn raw referrers into named channels.
-- =============================================================================
-- "t.co" / "l.instagram.com" / "com.google.android.gm" mean nothing at a
-- glance. This adds analytics_channel(source, referrer) which collapses the
-- tagged marketing slug AND the raw referrer host into a single human channel:
-- ChatGPT, Google, YouTube, TikTok, Instagram, Reddit, Gmail, Direct, …
--
-- Priority: a tagged source slug (tracemate.art/tiktok, ?utm_source=) wins;
-- otherwise we classify by the referrer host. AI assistants are first-class
-- (ChatGPT/Perplexity/Gemini/Claude/Copilot) since that's a fast-growing,
-- otherwise-invisible acquisition channel. Unknown hosts fall through as-is so
-- nothing is silently lost — they just show as the bare domain.
--
-- IMMUTABLE + pure SQL so it's cheap to call once per event row in the rollup,
-- and editable in one place: add a new platform = one WHEN clause + redeploy.
-- =============================================================================

create or replace function public.analytics_channel(p_source text, p_referrer text)
returns text
language sql
immutable
as $$
  with n as (
    select
      lower(coalesce(nullif(trim(p_source), ''), '')) as src,
      lower(coalesce(
        regexp_replace(
          substring(coalesce(p_referrer, '') from '^[a-z][a-z0-9+.-]*://([^/?#]+)'),
          '^www\.', ''
        ), '')) as host
  )
  select case
    -- ── tagged source slug takes priority (campaign links / utm_source) ──
    when src in ('tiktok','tt')        then 'TikTok'
    when src in ('youtube','yt')       then 'YouTube'
    when src in ('instagram','ig')     then 'Instagram'
    when src in ('reddit','rd')        then 'Reddit'
    when src in ('x','twitter')        then 'X (Twitter)'
    when src in ('facebook','fb')      then 'Facebook'
    when src in ('threads')            then 'Threads'
    when src in ('pinterest','pin')    then 'Pinterest'
    when src in ('linkedin')           then 'LinkedIn'
    when src in ('chatgpt','openai')   then 'ChatGPT'
    when src in ('perplexity')         then 'Perplexity'
    when src in ('gemini','bard')      then 'Gemini'
    when src in ('claude')             then 'Claude'
    when src in ('copilot')            then 'Copilot'
    when src in ('google')             then 'Google'
    when src in ('bing')               then 'Bing'
    when src in ('newsletter','email') then 'Newsletter'
    when src <> ''                     then initcap(src)   -- any other tag, shown as-is

    -- ── otherwise classify by the referrer host ──
    when host = '' then 'Direct'

    -- AI assistants
    when host like '%chatgpt.com%'
      or host like '%chat.openai.com%'
      or host like '%openai.com%'        then 'ChatGPT'
    when host like '%perplexity.ai%'      then 'Perplexity'
    when host like '%gemini.google.com%'
      or host like '%bard.google.com%'    then 'Gemini'
    when host like '%claude.ai%'          then 'Claude'
    when host like '%copilot.microsoft.com%' then 'Copilot'

    -- Search engines
    when host like '%google.%'            then 'Google'
    when host like '%bing.com%'           then 'Bing'
    when host like '%duckduckgo.com%'     then 'DuckDuckGo'
    when host like '%yahoo.%'             then 'Yahoo'
    when host like '%ecosia.org%'         then 'Ecosia'
    when host like '%search.brave.com%'   then 'Brave Search'
    when host like '%yandex.%'            then 'Yandex'

    -- Social / video / messaging
    when host like '%youtube.com%'
      or host like '%youtu.be%'           then 'YouTube'
    when host like '%tiktok.com%'         then 'TikTok'
    when host like '%instagram.com%'      then 'Instagram'
    when host like '%facebook.com%'
      or host like 'fb.%'
      or host like '%lm.facebook.com%'    then 'Facebook'
    when host = 't.co'
      or host like '%twitter.com%'
      or host like '%x.com%'              then 'X (Twitter)'
    when host like '%reddit.com%'         then 'Reddit'
    when host like '%pinterest.%'         then 'Pinterest'
    when host like '%linkedin.com%'
      or host like '%lnkd.in%'            then 'LinkedIn'
    when host like '%threads.net%'        then 'Threads'
    when host like '%t.me%'
      or host like '%telegram%'           then 'Telegram'
    when host like '%whatsapp%'
      or host = 'wa.me'                   then 'WhatsApp'
    when host like '%discord.%'           then 'Discord'
    when host like '%github.com%'         then 'GitHub'
    when host like '%producthunt.com%'    then 'Product Hunt'

    -- Email clients (referrer is the app, not a web host)
    when host like '%com.google.android.gm%'
      or host like '%mail.google.com%'    then 'Gmail'
    when host like '%outlook.%'           then 'Outlook'

    else host
  end
  from n;
$$;

grant execute on function public.analytics_channel(text, text) to service_role;

-- ── replace get_analytics_overview to ALSO return by_channel ─────────────────
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
  vis as (select distinct visitor_id from ev),
  sess as (select distinct session_id from ev),
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
         group by country_code order by visitors desc limit 200
      ) t
    ),

    -- NEW: clean named channels (the headline "where did they come from").
    'by_channel', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select public.analytics_channel(source, referrer) as channel,
               count(distinct visitor_id) as visitors
          from ev group by 1 order by visitors desc limit 40
      ) t
    ),

    'by_source', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select coalesce(nullif(source,''), '(direct)') as source,
               count(distinct visitor_id) as visitors
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
               count(*) as views,
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
