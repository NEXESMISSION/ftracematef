-- ============================================================================
-- C1/C2/C3 — safe public feed RPC (fixes author names + email leak)
-- ============================================================================
-- The client used to embed profiles(display_name, email, avatar_url) directly
-- on creations. That failed two ways:
--   1. creations.user_id references auth.users, not public.profiles, so there's
--      no FK for PostgREST to resolve the embed.
--   2. profiles RLS is self-only, so another user's name/avatar came back null
--      → every feed tile showed "Artist". And selecting email at all risked a
--      privacy leak if RLS were ever loosened.
--
-- This security-definer RPC joins the data server-side and returns ONLY safe
-- display fields (a derived display name + avatar) — never the email. Paginated
-- with a created_at keyset cursor so the feed scales as it fills up.
--
-- Idempotent.

create or replace function public.get_creations_feed(
  p_limit  int         default 30,
  p_before timestamptz default null
)
returns table (
  id             uuid,
  user_id        uuid,
  storage_path   text,
  reference_path text,
  title          text,
  note           text,
  like_count     integer,
  created_at     timestamptz,
  author         text,
  avatar_url     text
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.user_id,
    c.storage_path,
    c.reference_path,
    c.title,
    c.note,
    c.like_count,
    c.created_at,
    coalesce(nullif(p.display_name, ''), 'Artist') as author,
    p.avatar_url
  from public.creations c
  left join public.profiles p on p.id = c.user_id
  where p_before is null or c.created_at < p_before
  order by c.created_at desc
  limit greatest(1, least(p_limit, 60));
$$;

grant execute on function public.get_creations_feed(int, timestamptz) to anon, authenticated;

-- Which of a set of creations the calling user has liked (so the client can
-- light up the heart). Empty for signed-out users.
create or replace function public.my_liked_creations(p_ids uuid[])
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select creation_id from public.creation_likes
  where user_id = auth.uid() and creation_id = any(p_ids);
$$;

grant execute on function public.my_liked_creations(uuid[]) to authenticated;
