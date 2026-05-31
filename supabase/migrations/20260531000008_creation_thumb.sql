-- ============================================================================
-- D1/C-feed — store a small thumbnail per creation for the grid
-- ============================================================================
-- The feed grid renders ~140px tiles but was loading the full 1600px result
-- image into each one — wasteful once the feed is packed. We now generate a
-- ~400px thumbnail on publish and serve it in the feed; the full image loads
-- only when a tile is opened. Nullable so older rows fall back to the full url.
--
-- Idempotent.

alter table public.creations
  add column if not exists thumb_path text;

-- Extend the feed RPC to return the thumbnail path too. CREATE OR REPLACE can't
-- add a column to a function's OUT signature, so drop the prior version first.
drop function if exists public.get_creations_feed(int, timestamptz);

create or replace function public.get_creations_feed(
  p_limit  int         default 30,
  p_before timestamptz default null
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
    c.thumb_path,
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
