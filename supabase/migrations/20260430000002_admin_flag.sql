-- =============================================================================
-- Trace Mate — server-side admin flag on profiles
-- =============================================================================
-- Replaces the client-side VITE_ADMIN_EMAILS allowlist for UI gating. Bundling
-- admin emails into the production JS exposed the operator allowlist to anyone
-- reading the bundle — minor PII leak, no privilege escalation. This column
-- moves the "is this user an admin?" decision server-side; the frontend just
-- reads `profile.is_admin` (already RLS-restricted to self).
--
-- Source of truth for granting admin remains ops-controlled via SQL — there's
-- no client path to flipping this flag. The Edge Function security boundary
-- (dev-mutate-subscription's ADMIN_EMAILS env check) is unchanged: this column
-- only governs whether the UI bothers rendering the dev panel.
-- =============================================================================

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create index if not exists profiles_is_admin_idx
  on public.profiles (is_admin) where is_admin = true;

-- Helper for ops: grant or revoke admin for a single email. Service-role only
-- (revoked from public so authenticated users can't escalate via PostgREST).
-- Usage:  select public.set_admin_by_email('alice@example.com', true);
create or replace function public.set_admin_by_email(p_email text, p_is_admin boolean)
returns int language plpgsql security definer set search_path = public as $$
declare
  affected int;
begin
  update public.profiles
     set is_admin = p_is_admin
   where lower(email) = lower(p_email);
  get diagnostics affected = row_count;
  return affected;
end $$;

revoke all on function public.set_admin_by_email(text, boolean) from public;
grant execute on function public.set_admin_by_email(text, boolean) to service_role;
