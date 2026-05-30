-- =============================================================================
-- Trace Mate — in-app announcement / broadcast system
-- =============================================================================
-- Lets the operator push popup messages to all signed-in users or to a
-- segment (free / paid / inactive). The client polls get_active_announcement()
-- on load; if it returns one, the SPA shows a single dismissible modal and
-- reports seen/tapped/dismissed via record_announcement_event(). Per-user
-- frequency gating (once / daily / always) lives entirely in the RPC.
--
-- Mirrors the referral system's security posture: the tables are RLS deny-all
-- and revoked from anon/authenticated; clients only ever touch them through the
-- security-definer RPCs below (or the service role, via the admin Edge
-- Function). Segments require a profile, so this is SIGNED-IN USERS ONLY — an
-- anonymous visitor (auth.uid() is null) simply gets null back.
--
-- gen_random_uuid() is built into Postgres core (no extension needed); we use
-- it for the same reason the referral migration does.
-- =============================================================================

do $$ begin
  create type announcement_segment as enum ('all', 'free', 'paid', 'inactive');
exception when duplicate_object then null; end $$;

-- ── announcements (operator-authored broadcasts) ────────────────────────────
create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text,
  body        text not null,
  segment     announcement_segment not null default 'all',
  cta_label   text,
  cta_url     text,
  active      boolean not null default true,
  -- How often a given user may see this one:
  --   once   → exactly once, ever (until dismissed/expired)
  --   daily  → at most once per calendar day
  --   always → every load, until the user dismisses it or it expires
  frequency   text not null default 'once' check (frequency in ('once', 'daily', 'always')),
  starts_at   timestamptz not null default now(),
  expires_at  timestamptz,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists announcements_active_idx
  on public.announcements (active, created_at desc);

drop trigger if exists announcements_set_updated_at on public.announcements;
create trigger announcements_set_updated_at before update on public.announcements
  for each row execute function public.tg_set_updated_at();

-- ── announcement_events (one row per user per announcement) ──────────────────
-- Tracks the per-user lifecycle so the frequency gate and the admin rollup
-- counts work. One row per (announcement, user); columns fill in over time.
create table if not exists public.announcement_events (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  seen_at         timestamptz,
  dismissed_at    timestamptz,
  tapped_at       timestamptz,
  unique (announcement_id, user_id)
);
create index if not exists announcement_events_user_idx
  on public.announcement_events (user_id);

-- ── RLS: clients never touch these directly ─────────────────────────────────
alter table public.announcements       enable row level security;
alter table public.announcement_events enable row level security;

drop policy if exists announcements_deny_all on public.announcements;
create policy announcements_deny_all on public.announcements for all using (false) with check (false);
revoke all on public.announcements from anon, authenticated;

drop policy if exists announcement_events_deny_all on public.announcement_events;
create policy announcement_events_deny_all on public.announcement_events for all using (false) with check (false);
revoke all on public.announcement_events from anon, authenticated;

-- ── get_active_announcement: the one to show this caller right now ───────────
-- Returns the single most-recent active announcement that (a) is within its
-- start/expiry window, (b) matches the caller's segment, (c) hasn't been
-- dismissed by this user, and (d) passes the frequency gate. Returns null when
-- there's nothing to show (or the caller is anonymous).
create or replace function public.get_active_announcement()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_is_paid   boolean;
  v_inactive  boolean;
  v_row       record;
begin
  -- Signed-in users only — segments need a profile.
  if v_uid is null then return null; end if;

  -- Segment facts for this caller.
  v_is_paid := exists (
    select 1 from public.subscriptions s
     where s.user_id = v_uid
       and s.status = 'active'
       and s.plan::text <> 'free'
       and (s.plan::text = 'lifetime' or s.current_period_end > now())
  );

  select (p.last_seen_at is null or p.last_seen_at < now() - interval '14 days')
    into v_inactive
    from public.profiles p
   where p.id = v_uid;
  v_inactive := coalesce(v_inactive, true);

  select a.id, a.title, a.body, a.cta_label, a.cta_url
    into v_row
    from public.announcements a
   where a.active = true
     and now() between a.starts_at and coalesce(a.expires_at, 'infinity'::timestamptz)
     and (
          a.segment = 'all'
       or (a.segment = 'free'     and not v_is_paid)
       or (a.segment = 'paid'     and v_is_paid)
       or (a.segment = 'inactive' and v_inactive)
     )
     -- Never re-show something this user dismissed.
     and not exists (
          select 1 from public.announcement_events e
           where e.announcement_id = a.id
             and e.user_id = v_uid
             and e.dismissed_at is not null
     )
     -- Frequency gate.
     and (
          a.frequency = 'always'
       or (a.frequency = 'once' and not exists (
            select 1 from public.announcement_events e
             where e.announcement_id = a.id and e.user_id = v_uid and e.seen_at is not null))
       or (a.frequency = 'daily' and not exists (
            select 1 from public.announcement_events e
             where e.announcement_id = a.id and e.user_id = v_uid
               and e.seen_at is not null and e.seen_at::date = current_date))
     )
   order by a.created_at desc
   limit 1;

  if not found then return null; end if;

  return jsonb_build_object(
    'id',        v_row.id,
    'title',     v_row.title,
    'body',      v_row.body,
    'cta_label', v_row.cta_label,
    'cta_url',   v_row.cta_url
  );
end $$;

revoke all    on function public.get_active_announcement() from public;
grant execute on function public.get_active_announcement() to authenticated;

-- ── record_announcement_event: the user saw / tapped / dismissed it ─────────
-- Upserts one row per (caller, announcement) and stamps the relevant column.
-- seen_at is only set the first time so the 'once'/'daily' gates stay stable.
create or replace function public.record_announcement_event(p_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_id is null then return; end if;
  if p_kind not in ('seen', 'tapped', 'dismissed') then return; end if;

  insert into public.announcement_events (announcement_id, user_id, seen_at, tapped_at, dismissed_at)
  values (
    p_id,
    v_uid,
    case when p_kind = 'seen'      then now() end,
    case when p_kind = 'tapped'    then now() end,
    case when p_kind = 'dismissed' then now() end
  )
  on conflict (announcement_id, user_id) do update
    set seen_at      = case when p_kind = 'seen'      then coalesce(public.announcement_events.seen_at, now())
                            else public.announcement_events.seen_at end,
        tapped_at    = case when p_kind = 'tapped'    then now() else public.announcement_events.tapped_at end,
        dismissed_at = case when p_kind = 'dismissed' then now() else public.announcement_events.dismissed_at end;
end $$;

revoke all    on function public.record_announcement_event(uuid, text) from public;
grant execute on function public.record_announcement_event(uuid, text) to authenticated;

-- ── get_admin_announcement_stats: operator rollup (service role only) ───────
-- One jsonb array, one element per announcement, with seen/tapped/dismissed
-- counts. Called by the admin-announcements Edge Function under the service
-- role; never exposed to clients.
create or replace function public.get_admin_announcement_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  from (
    select
      a.id,
      a.title,
      a.body,
      a.segment,
      a.cta_label,
      a.cta_url,
      a.active,
      a.frequency,
      a.starts_at,
      a.expires_at,
      a.created_at,
      coalesce((select count(*) from public.announcement_events e
                 where e.announcement_id = a.id and e.seen_at is not null), 0)      as seen_count,
      coalesce((select count(*) from public.announcement_events e
                 where e.announcement_id = a.id and e.tapped_at is not null), 0)    as tapped_count,
      coalesce((select count(*) from public.announcement_events e
                 where e.announcement_id = a.id and e.dismissed_at is not null), 0) as dismissed_count
    from public.announcements a
    order by a.created_at desc
  ) t;
$$;

revoke all    on function public.get_admin_announcement_stats() from public;
grant execute on function public.get_admin_announcement_stats() to service_role;
