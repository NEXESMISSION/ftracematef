-- ============================================================================
-- C2 — add a note to shared results + let admins moderate the feed
-- ============================================================================
-- note: a short caption the user writes when publishing ("my first dog!").
-- Admin moderation: admins can delete ANY creation (and its storage objects),
-- not just their own, so the operator can clean up the public gallery.
--
-- Idempotent.

alter table public.creations
  add column if not exists note text;

-- Admin-wide delete on the catalog rows.
do $$ begin
  create policy creations_admin_delete on public.creations for delete
    using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
exception when duplicate_object then null; end $$;

-- Admin-wide delete on the storage objects in the creations bucket.
do $$ begin
  create policy creations_obj_admin_delete on storage.objects for delete
    using (
      bucket_id = 'creations'
      and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
    );
exception when duplicate_object then null; end $$;
