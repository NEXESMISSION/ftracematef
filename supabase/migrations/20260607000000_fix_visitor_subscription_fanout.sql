-- =============================================================================
-- Fix subscription fan-out in list_visitors() and get_visitor_profile().
-- =============================================================================
-- Both RPCs did `left join public.subscriptions s on s.user_id = v.user_id`
-- with NO status filter. The unique-active index only enforces ONE active row
-- per user, but a user who ever upgraded keeps their cancelled/failed rows too
-- (e.g. a free 'active' seeded at signup that becomes 'cancelled' on upgrade,
-- plus the new paid 'active'). So any signed-up visitor with >1 subscription
-- row fanned out into MULTIPLE base rows, which:
--   * duplicated the visitor in list_visitors.rows,
--   * inflated list_visitors.total (the unpaginated count the UI pages on),
--     breaking pagination (duplicate/missing rows across pages), and
--   * made get_visitor_profile.row_to_json pick an arbitrary subscription
--     (undefined ordering) or error on a multi-row scalar subquery.
--
-- Fix: replace the plain join with a LATERAL subselect that returns exactly
-- ONE subscription per user — the active one if present, else the most recent.
-- This mirrors the active-then-latest logic admin-list-users already does in TS.
-- Function signatures are unchanged, so admin-analytics needs no redeploy.
-- list_visitors keeps the admin / exclude_from_analytics exclusion predicate
-- from 20260604010000; get_visitor_profile stays unfiltered (single-visitor
-- drill-down, reached only via the triple-gated admin-analytics Edge Function).
-- =============================================================================

-- ── list_visitors ────────────────────────────────────────────────────────────
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
    -- One subscription per user: active first, then most recent. Avoids the
    -- multi-row fan-out that duplicated visitors and broke pagination.
    left join lateral (
      select plan, status
      from public.subscriptions
      where user_id = v.user_id
      order by (status = 'active') desc, created_at desc
      limit 1
    ) s on true
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

-- ── get_visitor_profile ──────────────────────────────────────────────────────
create or replace function public.get_visitor_profile(p_visitor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if p_visitor_id is null then return null; end if;

  select jsonb_build_object(
    'visitor', (
      select row_to_json(t) from (
        select
          v.visitor_id, v.first_seen_at, v.last_seen_at,
          public.analytics_channel(v.source, v.referrer) as channel,
          v.source, v.campaign, v.affiliate, v.referrer, v.landing_path,
          v.device_type, v.os, v.browser, v.ua, v.lang, v.tz,
          v.country, v.country_code, v.region, v.city, v.lat, v.lon,
          v.sessions, v.events, v.pageviews,
          v.user_id,
          pr.email, pr.display_name, pr.created_at as account_created_at,
          s.plan, s.status, s.current_period_end,
          (s.status = 'active' and s.plan <> 'free') as paid
        from public.analytics_visitors v
        left join public.profiles pr on pr.id = v.user_id
        -- One subscription per user (active first, then latest) — see note above.
        left join lateral (
          select plan, status, current_period_end
          from public.subscriptions
          where user_id = v.user_id
          order by (status = 'active') desc, created_at desc
          limit 1
        ) s on true
        where v.visitor_id = p_visitor_id
      ) t
    ),
    'events', (
      select coalesce(jsonb_agg(row_to_json(e) order by e.created_at), '[]'::jsonb) from (
        select
          created_at, session_id, type, path, referrer,
          country, city, device_type, props
        from public.analytics_events
        where visitor_id = p_visitor_id
        order by created_at
        limit 1000
      ) e
    )
  )
  into result;

  return result;
end $$;

revoke all    on function public.get_visitor_profile(uuid) from public, anon, authenticated;
grant execute on function public.get_visitor_profile(uuid) to service_role;
