-- =============================================================================
-- Trace Mate — track whether a tracing session produced a saved recording
-- =============================================================================
-- "Did the user actually save something?" is the single best engagement /
-- churn signal we can capture today: a session that ends in a downloaded clip
-- is a session that delivered a result the user wanted to keep. We already
-- track time-spent and what-they-traced (image_label); this adds the
-- save/share outcome.
--
--   1. trace_session_runs.recorded — per-run boolean, set on close from the
--      client's "did this session save a video" flag (p_recorded). A session
--      with multiple saves still reads true; one with none reads false.
--   2. profiles.traces_recorded — running count of sessions that produced a
--      saved clip. Surfaced on the admin dashboard alongside trace_sessions.
--
-- end_trace_run() grows a p_recorded param (defaulted false so any older
-- caller / pagehide path that omits it still closes the run cleanly). The old
-- 2-arg signature is dropped so PostgREST doesn't see an ambiguous overload.
--
-- Idempotent — safe to re-run.
-- =============================================================================

alter table public.trace_session_runs
  add column if not exists recorded boolean not null default false;

alter table public.profiles
  add column if not exists traces_recorded int not null default 0;

-- Drop the prior 2-arg version so the new defaulted-3-arg version is the only
-- end_trace_run PostgREST can resolve (avoids "function is not unique").
drop function if exists public.end_trace_run(uuid, text);
drop function if exists public.end_trace_run(uuid, text, boolean);
create or replace function public.end_trace_run(
  p_run_id   uuid,
  p_reason   text    default 'client_end',
  p_recorded boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_dur int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_run_id is null then
    return;
  end if;

  -- Close the row only if it's still open. RETURNING gives us the duration
  -- so we can fold it into the user's total in the same transaction.
  update public.trace_session_runs
     set ended_at         = v_now,
         duration_seconds = greatest(0, least(86400, extract(epoch from (v_now - started_at))::int)),
         recorded         = coalesce(p_recorded, false),
         closed_reason    = case
           when p_reason in ('client_end','unload','reconciled') then p_reason
           else 'client_end'
         end
   where id = p_run_id
     and user_id = v_uid
     and ended_at is null
   returning duration_seconds into v_dur;

  if found then
    update public.profiles
       set total_trace_seconds = total_trace_seconds
             + case when v_dur is not null and v_dur > 0 then v_dur else 0 end,
           traces_recorded = traces_recorded
             + case when coalesce(p_recorded, false) then 1 else 0 end
     where id = v_uid;
  end if;

  -- Clear "currently tracing" presence regardless of whether the run was
  -- already closed — the user said they're done. Only clear if the active
  -- run id matches, so we don't stomp on a fresh run the user opened in a
  -- different tab between our client's End-session click and this RPC.
  update public.profiles
     set current_page        = case when current_page = 'trace' then null else current_page end,
         current_image_label = null,
         current_run_id      = null
   where id = v_uid
     and (current_run_id is null or current_run_id = p_run_id);
end $$;

revoke all    on function public.end_trace_run(uuid, text, boolean) from public;
grant execute on function public.end_trace_run(uuid, text, boolean) to authenticated;
