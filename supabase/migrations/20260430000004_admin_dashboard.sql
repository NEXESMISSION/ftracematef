-- =============================================================================
-- Trace Mate — admin dashboard support
-- =============================================================================
-- Adds the plumbing the secret /admin-me dashboard needs:
--   1. profiles.last_seen_at — heartbeat column the client stamps every ~60s
--      while the tab is visible. Used to render the "online now" green dot.
--   2. touch_last_seen() RPC — security-definer write path so the column
--      stays caller-scoped without a broad UPDATE policy on profiles.
--   3. Auto-grant is_admin to nexesmission@gmail.com if a profile already
--      exists for that email. Server-side gate (ADMIN_EMAILS env on the
--      admin-list-users edge function) is the actual security boundary;
--      this just lets the UI know to render the dashboard hint.
--
-- Idempotent so it can be re-run.
-- =============================================================================

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

-- Useful for "list everyone, freshest first" scans on the admin dashboard.
create index if not exists profiles_last_seen_at_idx
  on public.profiles (last_seen_at desc nulls last);

-- The profiles_self_update policy lets users self-update any column on their
-- own row, so this column would be writable from the client by default. We
-- still want a security-definer RPC as the *sanctioned* write path so we can
-- (a) always stamp now() rather than trusting a client-supplied timestamp,
-- and (b) keep the option open of revoking direct UPDATE on this column
-- later without breaking the heartbeat. For belt-and-braces, also block
-- the column from direct UPDATE — same treatment as free_trial_started_at.
revoke update (last_seen_at) on public.profiles from authenticated, anon;

create or replace function public.touch_last_seen()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
     set last_seen_at = v_now
   where id = v_uid;

  return v_now;
end $$;

revoke all on function public.touch_last_seen() from public;
grant execute on function public.touch_last_seen() to authenticated;

-- One-time seed: flip is_admin on the operator's profile if it already
-- exists. New signups under that email are NOT auto-promoted — only the
-- exact pre-existing profile row gets stamped here. Re-running this
-- migration is safe: the update is a no-op on already-admin rows.
update public.profiles
   set is_admin = true
 where lower(email) = 'nexesmission@gmail.com'
   and is_admin = false;
