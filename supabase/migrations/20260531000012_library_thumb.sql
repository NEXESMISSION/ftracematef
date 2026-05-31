-- ============================================================================
-- A1 perf — thumbnails for the library picker
-- ============================================================================
-- The picker rendered the full 1600px asset into ~110px tiles, so opening it
-- downloaded megabytes for thumbnails. Store a small thumb per library image
-- (generated client-side on admin upload) and serve it in the grid; the full
-- image still loads when the user actually picks it into the tracing flow.
-- Nullable so existing rows fall back to the full image.
--
-- Idempotent.

alter table public.library_images
  add column if not exists thumb_path text;
