-- =============================================================================
-- Trace Mate — admin-initiated support threads
-- =============================================================================
-- Lets the operator start a chat with any user without that user having to
-- send the first message. Returns the existing thread if one is already
-- there, otherwise creates a fresh row owned by the target user.
--
-- Same security shape as start_support_thread: caller must be authenticated;
-- the additional constraint here is that the caller must be an admin
-- (server-checked, not trusted from the client).
--
-- Idempotent — safe to re-run.
-- =============================================================================

create or replace function public.admin_start_support_thread_for_user(
  p_user_id uuid
) returns public.support_threads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.support_threads%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_caller_admin() then
    raise exception 'Not authorized';
  end if;

  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  -- Reject targets that don't exist as profiles. Without this, the FK on the
  -- INSERT below would still trip, but the error message would be a generic
  -- foreign-key violation rather than something the UI can surface cleanly.
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'User not found';
  end if;

  select * into v_row from public.support_threads where user_id = p_user_id;
  if found then
    return v_row;
  end if;

  insert into public.support_threads (user_id)
       values (p_user_id)
  on conflict (user_id) do update set user_id = excluded.user_id  -- harmless self-touch on race
  returning * into v_row;

  return v_row;
end $$;

revoke all on function public.admin_start_support_thread_for_user(uuid) from public;
grant execute on function public.admin_start_support_thread_for_user(uuid) to authenticated;
