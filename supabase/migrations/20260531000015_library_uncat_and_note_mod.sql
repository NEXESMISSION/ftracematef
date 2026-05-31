-- ============================================================================
-- Library: drop categories  +  Gallery: admin note moderation
-- ============================================================================
-- 1) The library is now a single flat collection ("dump all in one") — the
--    anime/movies/music split is gone. Relax the CHECK constraint and give the
--    column a default so existing rows stay valid and new uploads don't need a
--    category. We keep the column (nullable, default 'general') rather than
--    dropping it so historical rows and any external readers don't break.
-- 2) Admins can already hide/delete a whole creation, but couldn't clear just a
--    bad NOTE. Add a security-definer RPC so an operator can wipe an
--    inappropriate caption without nuking the artwork.
--
-- Idempotent: safe to re-run.

-- ── 1. Library: uncategorized ───────────────────────────────────────────────
alter table public.library_images
  drop constraint if exists library_images_category_check;

alter table public.library_images
  alter column category set default 'general';

alter table public.library_images
  alter column category drop not null;

-- ── 2. Gallery: admin clears a creation's note ──────────────────────────────
create or replace function public.admin_clear_creation_note(p_creation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin
  ) then
    raise exception 'not authorized';
  end if;

  update public.creations
     set note = null
   where id = p_creation_id;
end;
$$;

revoke all on function public.admin_clear_creation_note(uuid) from public, anon;
grant execute on function public.admin_clear_creation_note(uuid) to authenticated;
