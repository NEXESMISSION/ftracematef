-- ============================================================================
-- A1 — Pre-uploaded image library
-- ============================================================================
-- Admin-curated line-art the user can pick straight into the tracing overlay,
-- organized by category. Images live in a public Storage bucket; this table is
-- the catalog (category + title + path). Public read, admin write.
--
-- Idempotent: safe to re-run.

create table if not exists public.library_images (
  id           uuid primary key default gen_random_uuid(),
  category     text not null check (category in ('anime', 'movies', 'music')),
  title        text,
  storage_path text not null,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists library_images_category_idx
  on public.library_images (category, sort_order, created_at);

alter table public.library_images enable row level security;

-- Anyone (including signed-out visitors) can browse the library.
drop policy if exists library_public_read on public.library_images;
create policy library_public_read
  on public.library_images for select
  using (true);

-- Only admins can add / edit / remove catalog rows.
drop policy if exists library_admin_write on public.library_images;
create policy library_admin_write
  on public.library_images for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- Public Storage bucket for the library assets.
insert into storage.buckets (id, name, public)
values ('library', 'library', true)
on conflict (id) do update set public = true;

-- Reads are public via the bucket's public flag; writes are admin-only.
drop policy if exists library_obj_admin_all on storage.objects;
create policy library_obj_admin_all
  on storage.objects for all
  using (
    bucket_id = 'library'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  )
  with check (
    bucket_id = 'library'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );
