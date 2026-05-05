-- =============================================================================
-- Trace Mate — live presence context (page + image label)
-- =============================================================================
-- profiles.last_seen_at already tells the admin dashboard "this user is online
-- right now". Add two more columns so the dashboard can also tell *what
-- they're doing*:
--
--   current_page         — short page identifier ('home','upload','trace',
--                          'account','live','admin', …). Set by the client
--                          via touch_last_seen() / heartbeat_trace_run().
--   current_image_label  — file name (or short label) of the image the user
--                          is tracing. Cleared on exit. Always null off /trace.
--   current_run_id       — id of the active trace_session_runs row, used by
--                          end_trace_run() to avoid stomping on a fresh run
--                          opened in another tab between End-session and the
--                          server arriving.
--
-- touch_last_seen() is extended with two optional params so existing no-arg
-- callers keep working. Passing null leaves the column unchanged; passing
-- empty string clears it; passing a non-empty string sets it.
--
-- Idempotent — safe to re-run.
-- =============================================================================

alter table public.profiles
  add column if not exists current_page         text,
  add column if not exists current_image_label  text,
  add column if not exists current_run_id       uuid;

-- Same defense-in-depth as last_seen_at: a self-update policy on profiles
-- would otherwise let the client write whatever it wants here. Force writes
-- through the security-definer RPCs so the server controls the values.
revoke update (current_page, current_image_label, current_run_id)
  on public.profiles from authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- Extend touch_last_seen() with optional page + image-label arguments.
--
-- Semantics for each text arg:
--   - NULL          → leave the existing column value alone (no change)
--   - empty string  → clear the column to NULL (user navigated away from a
--                     page where we'd previously stamped context)
--   - any other     → set the column (clamped to 200 chars)
--
-- The split lets the AuthProvider call this from any route to refresh
-- presence (passing the page name) while a /trace heartbeat that goes
-- through heartbeat_trace_run() can keep page='trace' + image_label
-- accurate at a higher cadence.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the old no-arg signature first — Postgres allows overloading on
-- arity, but keeping both invites the wrong one being picked by accident.
drop function if exists public.touch_last_seen();

create or replace function public.touch_last_seen(
  p_page  text default null,
  p_image text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_page  text;
  v_image text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Length-clamp; the columns are TEXT so there's no DB-side cap.
  v_page  := case
    when p_page is null     then null
    when length(p_page)  > 64  then left(p_page,  64)
    else p_page
  end;
  v_image := case
    when p_image is null    then null
    when length(p_image) > 200 then left(p_image, 200)
    else p_image
  end;

  update public.profiles
     set last_seen_at = v_now,
         current_page = case
           when p_page is null      then current_page          -- no change
           when v_page = ''         then null                  -- explicit clear
           else v_page
         end,
         current_image_label = case
           when p_image is null     then current_image_label   -- no change
           when v_image = ''        then null                  -- explicit clear
           else v_image
         end
   where id = v_uid;

  return v_now;
end $$;

revoke all on function public.touch_last_seen(text, text) from public;
grant execute on function public.touch_last_seen(text, text) to authenticated;
