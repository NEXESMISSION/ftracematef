-- ============================================================================
-- C-feed hardening — storage limits, rate limits, likes privacy, moderation
-- ============================================================================
-- Fixes from the review:
--   #3  storage buckets had no size/type limit (any file, any size, public).
--   #4  publish + like had no rate limiting (cost/spam amplification).
--   #5  no moderation gate — anything shows publicly instantly.
--   #7  note text needs server-side trim/guard (length already capped client).
--   #12 drop the now-unused get_leaderboard RPC.
--   #14 creation_likes was world-readable (social-graph leak).
--
-- Idempotent.

-- ── #3 Storage limits: only images, max 10 MB, on both public buckets ────────
update storage.buckets
   set file_size_limit = 10485760,  -- 10 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif']
 where id in ('creations', 'library');

-- ── #4 Rate-limit publishing (direct INSERT) via a BEFORE INSERT trigger ─────
-- 20 published creations / hour is ~10x any honest pace. check_rate_limit uses
-- auth.uid(), which is preserved inside a security-definer trigger.
create or replace function public.creations_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.check_rate_limit('publish_creation', 20, interval '1 hour') then
    raise exception 'You are posting too fast. Please wait a bit and try again.'
      using errcode = 'check_violation';
  end if;
  -- #7 server-side note hygiene: trim + hard length cap regardless of client.
  if new.note is not null then
    new.note := nullif(left(btrim(new.note), 200), '');
  end if;
  return new;
end;
$$;

drop trigger if exists creations_insert_guard on public.creations;
create trigger creations_insert_guard
  before insert on public.creations
  for each row execute function public.creations_insert_guard();

-- ── #4 Rate-limit likes via a BEFORE INSERT trigger on creation_likes ────────
create or replace function public.creation_likes_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.check_rate_limit('toggle_like', 120, interval '1 minute') then
    raise exception 'Too many likes too fast. Slow down a moment.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists creation_likes_insert_guard on public.creation_likes;
create trigger creation_likes_insert_guard
  before insert on public.creation_likes
  for each row execute function public.creation_likes_insert_guard();

-- ── #14 Likes privacy: readable only by their owner ─────────────────────────
-- The feed never needs others' like rows (my_liked_creations is the only reader
-- and it's security-definer). like_count lives denormalized on creations.
do $$ begin
  drop policy if exists creation_likes_read on public.creation_likes;
exception when undefined_object then null; end $$;
do $$ begin
  create policy creation_likes_read_self on public.creation_likes for select
    using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ── #5 Moderation: hidden flag + reports, and a feed that excludes hidden ────
alter table public.creations
  add column if not exists hidden boolean not null default false;

create table if not exists public.creation_reports (
  id          uuid primary key default gen_random_uuid(),
  creation_id uuid not null references public.creations(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now(),
  unique (creation_id, reporter_id)
);
alter table public.creation_reports enable row level security;

-- A user can file/read their own reports; admins can read all.
do $$ begin
  create policy creation_reports_own on public.creation_reports for all
    using (auth.uid() = reporter_id) with check (auth.uid() = reporter_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy creation_reports_admin_read on public.creation_reports for select
    using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
exception when duplicate_object then null; end $$;

-- report_creation(id, reason) — file a report (idempotent per user) and auto-
-- hide a creation once it crosses a small report threshold, so abuse comes down
-- fast without waiting for an admin.
create or replace function public.report_creation(p_creation_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.check_rate_limit('report_creation', 30, interval '1 hour') then
    raise exception 'Too many reports. Please slow down.' using errcode = 'check_violation';
  end if;

  insert into public.creation_reports (creation_id, reporter_id, reason)
  values (p_creation_id, v_uid, nullif(left(btrim(coalesce(p_reason, '')), 300), ''))
  on conflict (creation_id, reporter_id) do nothing;

  select count(*) into v_count from public.creation_reports where creation_id = p_creation_id;
  if v_count >= 3 then
    update public.creations set hidden = true where id = p_creation_id;
  end if;
end;
$$;

grant execute on function public.report_creation(uuid, text) to authenticated;

-- Admin: hide / unhide a creation without deleting it.
create or replace function public.set_creation_hidden(p_creation_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin) then
    raise exception 'Not authorized';
  end if;
  update public.creations set hidden = coalesce(p_hidden, true) where id = p_creation_id;
end;
$$;

grant execute on function public.set_creation_hidden(uuid, boolean) to authenticated;

-- Feed RPC now excludes hidden creations. p_include_hidden lets admins audit.
drop function if exists public.get_creations_feed(int, timestamptz);
create or replace function public.get_creations_feed(
  p_limit          int         default 30,
  p_before         timestamptz default null,
  p_include_hidden boolean     default false
)
returns table (
  id             uuid,
  user_id        uuid,
  storage_path   text,
  thumb_path     text,
  reference_path text,
  title          text,
  note           text,
  like_count     integer,
  hidden         boolean,
  created_at     timestamptz,
  author         text,
  avatar_url     text
)
language sql
security definer
set search_path = public
as $$
  select
    c.id, c.user_id, c.storage_path, c.thumb_path, c.reference_path,
    c.title, c.note, c.like_count, c.hidden, c.created_at,
    coalesce(nullif(p.display_name, ''), 'Artist') as author,
    p.avatar_url
  from public.creations c
  left join public.profiles p on p.id = c.user_id
  where (p_before is null or c.created_at < p_before)
    and (
      -- non-hidden for everyone; hidden only when an admin asks to include them
      c.hidden = false
      or (p_include_hidden and exists (select 1 from public.profiles a where a.id = auth.uid() and a.is_admin))
    )
  order by c.created_at desc
  limit greatest(1, least(p_limit, 60));
$$;

grant execute on function public.get_creations_feed(int, timestamptz, boolean) to anon, authenticated;

-- ── #12 Drop the unused leaderboard RPCs ────────────────────────────────────
drop function if exists public.get_leaderboard(int, text);
drop function if exists public.get_leaderboard(int);
