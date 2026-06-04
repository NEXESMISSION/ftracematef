-- Security audit fix — close an IDOR on profiles.dodo_customer_id.
--
-- The `profiles_self_update` policy (20260430000000_init.sql) is
-- `for update using (auth.uid() = id)` with NO `with check`, and the codebase
-- locks down sensitive columns one-by-one via `revoke update (col)` (see
-- is_admin, last_seen_at, free_trial_started_at, free_sessions_used, …).
-- Two billing/identity columns were never revoked: `dodo_customer_id` and
-- `email`. An authenticated user could therefore:
--
--   update public.profiles
--      set dodo_customer_id = '<another customer''s Dodo id>'
--    where id = auth.uid();
--
-- …via PostgREST, after which `list-payments` returns that customer's payment
-- history and `create-portal-session` opens their billing portal. This is a
-- real cross-account billing-data exposure.
--
-- Fix: revoke client UPDATE on both columns (service_role — the webhook and
-- edge functions — bypasses column grants, so the server still manages them),
-- and add a `with check` so an update can never reassign row ownership.
--
-- Safe to run repeatedly. display_name / avatar_url remain user-editable.

begin;

revoke update (dodo_customer_id, email) on public.profiles from authenticated, anon;

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

commit;
