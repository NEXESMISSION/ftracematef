-- =============================================================================
-- Per-visitor drill-down — individual attribution, not just stacked rollups.
-- =============================================================================
-- get_analytics_overview() answers "how many came from X". It can't answer
-- "WHO is this one person, where did THEY come from, and what did THEY do".
-- The data was always there (the analytics_visitors spine + the analytics_
-- events firehose, stitched to an account via user_id), but no read path
-- surfaced it per-individual. This migration adds two security-definer RPCs:
--
--   * list_visitors()       — a paginated, searchable list of INDIVIDUAL
--                             visitors: channel · referrer · geo · device ·
--                             first/last seen · signed-up? · paid?  With a
--                             "signed-up only" filter and free-text search.
--   * get_visitor_profile() — one visitor's full story: first-touch acquisition,
--                             geo, device, linked account + subscription, and
--                             the complete ordered event timeline (landing →
--                             … → signup → traced → subscribed).
--
-- Same trust model as the rest of the analytics surface: service_role-only,
-- called exclusively by the triple-gated admin-analytics Edge Function. No
-- browser role can reach these. Reads data already collected — no new
-- collection, no raw IPs, nothing the privacy model didn't already allow.
-- =============================================================================

-- ── list_visitors ────────────────────────────────────────────────────────────
-- Returns { total, rows: [...] }. `total` is the unpaginated count for the
-- same filter so the UI can page. A visitor is included when their activity
-- OVERLAPS the window (last_seen in/after p_from AND first_seen before p_to),
-- so the list shows everyone who was around in the range, not only first-touch.
--
-- p_only_signedup → restrict to visitors stitched to an account.
-- p_search        → case-insensitive match on email / display name / city /
--                   country / source / referrer / visitor_id.
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
-- The full individual story for one visitor_id. Returns:
--   { visitor: {...spine + account + subscription...}, events: [...timeline...] }
-- The event timeline is ordered oldest→newest and capped (1000 rows) so a very
-- chatty visitor can't blow up the payload; that's far more than any single
-- person generates in practice.
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
        left join public.subscriptions s on s.user_id = v.user_id
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
