-- =============================================================================
-- Hardening: authenticated visitor↔user stitch, is_admin trigger guard, cleanup
-- =============================================================================
-- Three security fixes surfaced by the audit:
--
-- 1. link_visitor() — the anonymous→account stitch used to ride on a client-
--    supplied `user_id` in the PUBLIC ingest endpoint, which anyone could spoof
--    to attribute fake traffic to a victim's account. We move the stitch to an
--    AUTHENTICATED, security-definer RPC that derives the user from auth.uid()
--    server-side. The ingest endpoint no longer accepts user_id at all.
--
-- 2. guard_is_admin() — a BEFORE UPDATE trigger that hard-rejects any change to
--    profiles.is_admin from a non-privileged role. The column UPDATE is already
--    revoked from authenticated/anon; this is belt-and-braces so the privilege
--    boundary can't silently regress if a future migration re-grants the column
--    or adds it to a new policy. (is_admin gates real RLS write power on the
--    library + creation-moderation tables, not just UI.)
--
-- 3. Cleanup of the deploy smoke-test / probe rows so the dashboard is clean.
-- =============================================================================

-- ── 1. link_visitor ─────────────────────────────────────────────────────────
-- Called from the client AFTER sign-in (AuthProvider → track.identify), with
-- the user's JWT, so auth.uid() is the authenticated user. Upserts so the link
-- lands regardless of whether the visitor row exists yet (the ingest batch and
-- this call race). First-touch on user_id: never overwrites an existing link
-- (a shared device stays attributed to whoever signed in first).
create or replace function public.link_visitor(p_visitor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_visitor_id is null then return; end if;

  insert into public.analytics_visitors as v (visitor_id, user_id)
  values (p_visitor_id, v_uid)
  on conflict (visitor_id) do update
    set user_id = coalesce(v.user_id, excluded.user_id);

  -- Backfill this visitor's recent anonymous events with the user id so the
  -- per-event attribution matches the spine (bounded to the last day to keep
  -- the write cheap; older anonymous events stay as-is).
  update public.analytics_events
     set user_id = v_uid
   where visitor_id = p_visitor_id
     and user_id is null
     and created_at > now() - interval '1 day';
end $$;

revoke all    on function public.link_visitor(uuid) from public, anon;
grant execute on function public.link_visitor(uuid) to authenticated;

-- ── 2. guard_is_admin ───────────────────────────────────────────────────────
create or replace function public.guard_is_admin()
returns trigger
language plpgsql
as $$
begin
  -- Only privileged roles may flip is_admin. Normal PostgREST callers run as
  -- 'authenticated'/'anon'; the legitimate setter set_admin_by_email() is
  -- security-definer owned by 'postgres', so it passes. service_role/admin
  -- maintenance also passes.
  if new.is_admin is distinct from old.is_admin
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'is_admin can only be changed by a privileged role';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_is_admin on public.profiles;
create trigger trg_guard_is_admin
  before update on public.profiles
  for each row
  execute function public.guard_is_admin();

-- ── 3. cleanup smoke-test / probe rows ──────────────────────────────────────
delete from public.analytics_events
 where source = 'smoketest' or path = '/probe' or referrer = 'probe';
delete from public.analytics_visitors
 where source = 'smoketest' or ua = 'probe' or ua = 'smoketest'
    or landing_path = '/probe';
