-- ============================================================================
-- Gallery compare popup: store a thumbnail for the REFERENCE image too
-- ============================================================================
-- The before/after compare popup loaded the full-size reference (up to 2048px)
-- with no small placeholder, so it felt very slow to open. We already store a
-- thumbnail for the result; add one for the reference so the popup can show a
-- tiny image instantly and swap to full-res in the background.
--
-- Backfill is not possible for old rows (no thumb was generated at publish);
-- those fall back to the full reference. New posts get the fast path.
--
-- Idempotent.

alter table public.creations
  add column if not exists reference_thumb_path text;

-- Re-create the feed RPC to surface the new column. Return-type change → drop
-- first (CREATE OR REPLACE can't add OUT columns).
drop function if exists public.get_creations_feed(int, int, text, boolean, boolean);

create or replace function public.get_creations_feed(
  p_limit          int     default 30,
  p_offset         int     default 0,
  p_sort           text    default 'new',
  p_only_reference boolean default false,
  p_include_hidden boolean default false
)
returns table (
  id                   uuid,
  user_id              uuid,
  storage_path         text,
  thumb_path           text,
  reference_path       text,
  reference_thumb_path text,
  title                text,
  note                 text,
  like_count           integer,
  hidden               boolean,
  created_at           timestamptz,
  author               text,
  avatar_url           text
)
language sql
security definer
set search_path = public
as $$
  select
    c.id, c.user_id, c.storage_path, c.thumb_path, c.reference_path,
    c.reference_thumb_path,
    c.title, c.note, c.like_count, c.hidden, c.created_at,
    coalesce(nullif(p.display_name, ''), 'Artist') as author,
    p.avatar_url
  from public.creations c
  left join public.profiles p on p.id = c.user_id
  where (
      c.hidden = false
      or (p_include_hidden and exists (select 1 from public.profiles a where a.id = auth.uid() and a.is_admin))
    )
    and (not p_only_reference or c.reference_path is not null)
  order by
    case when p_sort = 'top' then c.like_count end desc nulls last,
    c.created_at desc
  limit greatest(1, least(p_limit, 60))
  offset greatest(0, p_offset);
$$;

grant execute on function public.get_creations_feed(int, int, text, boolean, boolean) to anon, authenticated;
