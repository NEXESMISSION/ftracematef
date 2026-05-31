-- ============================================================================
-- C2 — store a copy of the traced reference image alongside the result
-- ============================================================================
-- When a user publishes their finished drawing, we now also keep a copy of the
-- reference image they were tracing, so viewers can see "traced THIS → made
-- THIS". reference_path points at an object in the same `creations` bucket
-- under the user's {uid}/… prefix. Nullable so older rows (and publishes where
-- the reference wasn't available) still work.
--
-- Idempotent.

alter table public.creations
  add column if not exists reference_path text;
