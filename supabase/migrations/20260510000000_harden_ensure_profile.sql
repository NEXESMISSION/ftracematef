-- =============================================================================
-- Trace Mate — harden ensure_profile() against silent-success failures
-- =============================================================================
-- The previous version (20260508000004_ensure_profile.sql) has two failure
-- modes that surfaced as the user being stuck on Account.jsx's
-- "Setting up your studio…" recover screen for 30 s before the manual
-- buttons appear:
--
--   1. NULL-RECORD RETURN
--      `select * into v_profile from public.profiles where id = v_uid;`
--      followed by `return v_profile;` does NOT raise on no-row — it
--      returns a record of all-NULL fields. PostgREST serialises that as
--      `{ id: null, email: null, ... }`, which the client treats as a
--      truthy "row" and stores in state. Downstream code that expects
--      `profile.id` to be a real uuid then crashes silently.
--
--   2. SIGNUP-TRIGGER ROLLBACK MASKING
--      handle_new_user() inserts the profile inside the auth.users
--      INSERT transaction. If `tg_notify_signup` raises (e.g., pg_net
--      extension missing or under permission drift), the rescue handler
--      catches it — but only if the function body PARSES at trigger-fire
--      time. A search_path resolution miss on `net.http_post` raises at
--      EXECUTION before our `exception` block sees it, rolling the
--      profile insert back. ensure_profile() then has to recreate it.
--
-- This migration fixes (1) by raising a clear exception when the row
-- still isn't visible after the heal — the client surfaces this as a
-- console error instead of a silent stuck-state. It also ensures the
-- INSERT path uses `returning *` directly so we never observe an empty
-- record from a follow-up SELECT racing replication on a multi-node
-- read replica.
--
-- Idempotent — safe to re-run.
-- =============================================================================

create or replace function public.ensure_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_user    auth.users;
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'ensure_profile: not authenticated' using errcode = '28000';
  end if;

  -- Fast path: row already exists.
  select * into v_profile from public.profiles where id = v_uid;
  if found then
    return v_profile;
  end if;

  -- Heal: pull display fields from auth.users. Mirrors handle_new_user().
  select * into v_user from auth.users where id = v_uid;
  if not found then
    -- The JWT decodes to a uid that no longer exists in auth.users —
    -- "ghost session" case. Raise a distinct errcode so the client can
    -- detect it and force a sign-out instead of looping the recovery.
    raise exception 'ensure_profile: auth user % not found', v_uid
      using errcode = 'P0002';  -- no_data_found
  end if;

  -- INSERT...RETURNING populates v_profile in the same statement, so we
  -- never depend on a follow-up SELECT seeing the row (which would race
  -- read-replica replication on a multi-node project).
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    v_user.id,
    v_user.email,
    coalesce(
      v_user.raw_user_meta_data->>'full_name',
      v_user.raw_user_meta_data->>'name',
      split_part(v_user.email, '@', 1)
    ),
    v_user.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
    set email = coalesce(public.profiles.email, excluded.email)
  returning * into v_profile;

  -- Mirror the trigger's free-subscription guard.
  insert into public.subscriptions (user_id, plan, status)
  select v_uid, 'free', 'active'
  where not exists (
    select 1 from public.subscriptions where user_id = v_uid
  );

  -- Belt-and-braces: if for any reason v_profile is somehow still a
  -- null-record (shouldn't happen with RETURNING but cheap to verify),
  -- raise instead of returning silent garbage.
  if v_profile.id is null then
    -- Last-ditch re-SELECT in case the INSERT...RETURNING was suppressed
    -- by a row-level security recheck on `excluded` columns.
    select * into v_profile from public.profiles where id = v_uid;
    if v_profile.id is null then
      raise exception 'ensure_profile: profile insert succeeded but row is not visible (uid=%)', v_uid
        using errcode = 'P0001';  -- raise_exception (generic)
    end if;
  end if;

  return v_profile;
end;
$$;

grant execute on function public.ensure_profile() to authenticated;

-- ── Diagnostic: confirm pg_net is actually loaded ──────────────────────
-- The signup notification trigger (tg_notify_signup) calls net.http_post
-- inside an `exception when others` rescue. Most failure modes there are
-- safely swallowed — BUT a missing `net.` schema causes the function to
-- fail to load on first call, which on some Postgres versions skips the
-- rescue and rolls the parent INSERT back. If pg_net is not enabled,
-- raise a notice during migration so the operator sees it in the push
-- output — better than silently shipping a broken signup path.
do $$
begin
  if not exists (
    select 1 from pg_extension where extname = 'pg_net'
  ) then
    raise notice
      '[trace-mate] pg_net extension is NOT enabled — signup trigger will silently swallow notifications, but a deeper failure could roll back profile inserts. Enable in dashboard → Database → Extensions.';
  end if;
end $$;
