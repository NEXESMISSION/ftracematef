-- ============================================================================
-- C2 / C3 / C1 — Published creations feed, likes, and leaderboard
-- ============================================================================
-- C2: users publish a photo of their finished trace to a shared feed.
-- C3: other users like a published creation (one like per user, toggle).
-- C1: a leaderboard ranks users by tracing activity.
--
-- Public read on the feed; owner-only insert/delete. Likes are one-per-user.
-- like_count is denormalized on creations and kept in sync by a trigger so the
-- feed never has to COUNT() per row.
--
-- Fully idempotent: policies/triggers are created inside DO/exception guards so
-- a partial prior apply can't block a re-run.

-- ── Creations (published results) ───────────────────────────────────────────
create table if not exists public.creations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  title        text,
  like_count   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists creations_created_idx on public.creations (created_at desc);
create index if not exists creations_user_idx    on public.creations (user_id);
create index if not exists creations_likes_idx   on public.creations (like_count desc, created_at desc);

alter table public.creations enable row level security;

do $$ begin
  create policy creations_public_read on public.creations for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy creations_owner_insert on public.creations for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy creations_owner_delete on public.creations for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ── Likes (one per user per creation) ───────────────────────────────────────
create table if not exists public.creation_likes (
  creation_id uuid not null references public.creations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (creation_id, user_id)
);

alter table public.creation_likes enable row level security;

do $$ begin
  create policy creation_likes_read on public.creation_likes for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy creation_likes_own on public.creation_likes for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- Keep creations.like_count in sync.
create or replace function public.sync_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.creations set like_count = like_count + 1 where id = new.creation_id;
  elsif (tg_op = 'DELETE') then
    update public.creations set like_count = greatest(0, like_count - 1) where id = old.creation_id;
  end if;
  return null;
end;
$$;

drop trigger if exists creation_likes_count on public.creation_likes;
create trigger creation_likes_count
  after insert or delete on public.creation_likes
  for each row execute function public.sync_like_count();

-- C3 — toggle a like for the calling user. Returns { liked, like_count }.
create or replace function public.toggle_like(p_creation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing int;
  v_count int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select 1 into v_existing from public.creation_likes
   where creation_id = p_creation_id and user_id = v_uid;

  if v_existing is null then
    insert into public.creation_likes (creation_id, user_id) values (p_creation_id, v_uid)
      on conflict do nothing;
    select like_count into v_count from public.creations where id = p_creation_id;
    return jsonb_build_object('liked', true, 'like_count', coalesce(v_count, 0));
  else
    delete from public.creation_likes where creation_id = p_creation_id and user_id = v_uid;
    select like_count into v_count from public.creations where id = p_creation_id;
    return jsonb_build_object('liked', false, 'like_count', coalesce(v_count, 0));
  end if;
end;
$$;

grant execute on function public.toggle_like(uuid) to authenticated;

-- C1 — leaderboard by tracing activity. Security definer so it can read other
-- users' aggregate stats while exposing only safe display fields. Admins are
-- excluded so the operator account doesn't top the board.
create or replace function public.get_leaderboard(p_limit int default 20)
returns table (
  rank           bigint,
  display_name   text,
  avatar_url     text,
  trace_sessions integer,
  current_streak integer
)
language sql
security definer
set search_path = public
as $$
  select
    row_number() over (order by p.trace_sessions desc, p.first_trace_at asc) as rank,
    coalesce(nullif(p.display_name, ''), split_part(coalesce(p.email, 'Artist'), '@', 1)) as display_name,
    p.avatar_url,
    p.trace_sessions,
    p.current_streak
  from public.profiles p
  where coalesce(p.is_admin, false) = false
    and coalesce(p.trace_sessions, 0) > 0
  order by p.trace_sessions desc, p.first_trace_at asc
  limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.get_leaderboard(int) to anon, authenticated;

-- ── Public Storage bucket for published result images ───────────────────────
insert into storage.buckets (id, name, public)
values ('creations', 'creations', true)
on conflict (id) do update set public = true;

-- Read is public (bucket flag). Users may write/delete only inside their own
-- {uid}/… prefix so one user can't overwrite another's image.
do $$ begin
  create policy creations_obj_owner_write on storage.objects for insert
    with check (bucket_id = 'creations' and auth.uid()::text = (storage.foldername(name))[1]);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy creations_obj_owner_delete on storage.objects for delete
    using (bucket_id = 'creations' and auth.uid()::text = (storage.foldername(name))[1]);
exception when duplicate_object then null; end $$;
