-- =============================================================================
-- Trace Mate — one-time free trial per account
-- =============================================================================
-- Adds a `free_trial_started_at` timestamp on profiles. The first time a
-- signed-in free user steps into the studio (/trace), the client calls the
-- `start_free_trial_if_unused()` RPC, which stamps `now()` if the column is
-- null. Subsequent calls are no-ops and return the existing value.
--
-- This column is the durable record that the account has consumed its trial.
-- The "is the trial still usable?" decision is otherwise client-side: a tab-
-- scoped sessionStorage flag in lib/freeTrial.js keeps the user inside the
-- studio for one /trace session (refresh-tolerant), and is cleared the moment
-- they navigate away — at which point the client treats the trial as 'used'
-- and shows the paywall on any future /trace attempt. Server-side enforcement
-- could be added later, but for now we trust the client because nothing
-- privileged happens during /trace — it's all on-device camera + overlay work.
--
-- Why an RPC instead of a direct UPDATE?
--   The existing `profiles_self_update` policy lets users self-update any
--   column of their own row, so a malicious client could simply NULL out the
--   column to reset the trial. The RPC enforces "set if null" atomically and
--   is the only sanctioned write path for this field — even if a user pokes
--   at the table directly, they can't roll back the stamp.
-- =============================================================================

alter table public.profiles
  add column if not exists free_trial_started_at timestamptz;

-- Belt-and-braces: stop direct UPDATEs from rolling the column back to NULL.
-- The self-update policy is broad (anything-goes on your own row), so we
-- forbid the specific column at the GRANT level. Service role still has full
-- access; the RPC below uses security definer to write it.
revoke update (free_trial_started_at) on public.profiles from authenticated, anon;

create or replace function public.start_free_trial_if_unused()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_started timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- First writer wins: only the row with NULL is updated. A second concurrent
  -- caller from another tab gets v_started=null here and falls through to the
  -- SELECT below, which returns the timestamp the first call wrote.
  update public.profiles
     set free_trial_started_at = now()
   where id = v_uid
     and free_trial_started_at is null
   returning free_trial_started_at into v_started;

  if v_started is null then
    select free_trial_started_at into v_started
      from public.profiles
     where id = v_uid;
  end if;

  return v_started;
end $$;

revoke all on function public.start_free_trial_if_unused() from public;
grant execute on function public.start_free_trial_if_unused() to authenticated;
