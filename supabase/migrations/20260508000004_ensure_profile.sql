-- ── Self-heal for missing profile rows ───────────────────────────────────
-- After a fresh sign-in, Account.jsx occasionally renders the "We couldn't
-- load your profile" screen because the profile row isn't visible to the
-- caller's session yet. Three known triggers:
--   (a) the on_auth_user_created trigger silently failed for this account
--       (e.g. constraint hiccup, a brief Supabase incident during signup)
--   (b) RLS briefly rejected the SELECT on a transient network blip
--   (c) the row was deleted out from under the user (manual cleanup,
--       account-recovery flow)
--
-- This RPC is the front-end's escape hatch — call it whenever the profile
-- fetch returns null for an authenticated caller, and it'll create the
-- row from auth.users metadata (idempotent — `on conflict do nothing`)
-- and ensure a free subscription exists. Returns the profile row.
--
-- security definer: needed to read auth.users (anon/authenticated cannot)
-- and to insert into profiles + subscriptions while bypassing RLS. The
-- only path is auth.uid() — a caller can ONLY heal their OWN profile,
-- never anyone else's. No path takes a user_id parameter.

create or replace function public.ensure_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_user auth.users;
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'ensure_profile: not authenticated';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if found then
    return v_profile;
  end if;

  -- Pull display fields from auth.users — same logic as handle_new_user()
  -- so the self-healed row is indistinguishable from one the trigger made.
  select * into v_user from auth.users where id = v_uid;
  if not found then
    raise exception 'ensure_profile: auth user % not found', v_uid;
  end if;

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
  on conflict (id) do nothing;

  -- Mirror the trigger's free-subscription guard so a heal that races
  -- with a still-pending trigger doesn't double-insert.
  insert into public.subscriptions (user_id, plan, status)
  select v_uid, 'free', 'active'
  where not exists (
    select 1 from public.subscriptions where user_id = v_uid
  );

  select * into v_profile from public.profiles where id = v_uid;
  return v_profile;
end;
$$;

grant execute on function public.ensure_profile() to authenticated;
