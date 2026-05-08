-- =============================================================================
-- Trace Mate — broadcaster status reporting on trace_session_runs
-- =============================================================================
-- Why
-- ────
-- The dashboard's "Watch live" feature relies on the user's /trace tab
-- subscribing to a WebRTC signaling channel as broadcaster. The heartbeat
-- (heartbeat_trace_run, plain HTTPS REST) and the broadcaster (Realtime
-- WebSocket presence + WebRTC) are entirely independent paths.
--
-- That split means we routinely see this state: heartbeat is fresh (user
-- IS on /trace), but the broadcaster never came up — the user denied
-- camera permission, is in an in-app browser whose WebView blocks
-- getUserMedia, the network blocks WebSocket, etc. The dashboard saw an
-- empty presence channel and showed "user closed the tab" — wrong copy
-- for half the cases.
--
-- Fix: have the user's broadcaster code stamp a small status string on
-- their open run row whenever the state changes. Admin can then render
-- accurate "Watch live" affordances and accurate stuck-hint copy.
--
-- Allowed values (enforced by check constraint, kept open-ended for
-- future signals):
--   'up'                  — broadcaster subscribed to realtime, presence
--                           tracked, ready to peer.
--   'camera_denied'       — getUserMedia rejected with NotAllowedError.
--   'no_camera'           — navigator.mediaDevices unavailable / device
--                           has no camera (NotFoundError).
--   'camera_error'        — getUserMedia threw something else (overcon-
--                           strained, in-use, hardware error, etc.).
--   'realtime_failed'     — channel.subscribe() returned CHANNEL_ERROR /
--                           TIMED_OUT / CLOSED.
--   'starting'            — broadcaster effect ran but the channel hasn't
--                           reported SUBSCRIBED yet; transient state.
--   'stopped'             — broadcaster torn down (effect cleanup,
--                           camera-effect re-run, etc.).
--   any other value       — accepted, just rendered as-is by the admin UI.
--
-- Idempotent — safe to re-run.
-- =============================================================================

alter table public.trace_session_runs
  add column if not exists broadcast_state text,
  add column if not exists broadcast_state_at timestamptz;

-- ── set_trace_broadcast_state ────────────────────────────────────────────────
-- Caller-authenticated. Only updates rows owned by the caller and only
-- while the run is still open (ended_at is null) — once a run is closed,
-- its broadcast state is frozen as historical context. No-op (no error)
-- if the run is missing or already closed; the client's state machine
-- doesn't need to know whether the row was actually updated.
--
-- Trims the state string to a sane length so a buggy client can't write
-- megabytes into the column. The check constraint above also limits
-- length implicitly via the index.
drop function if exists public.set_trace_broadcast_state(uuid, text);

create function public.set_trace_broadcast_state(
  p_run_id uuid,
  p_state  text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_state text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_run_id is null then
    return;
  end if;

  v_state := nullif(trim(coalesce(p_state, '')), '');
  if v_state is null then
    return;
  end if;
  if length(v_state) > 64 then
    v_state := left(v_state, 64);
  end if;

  update public.trace_session_runs
     set broadcast_state    = v_state,
         broadcast_state_at = now()
   where id        = p_run_id
     and user_id   = v_uid
     and ended_at is null;
end $$;

revoke all on function public.set_trace_broadcast_state(uuid, text) from public;
grant execute on function public.set_trace_broadcast_state(uuid, text) to authenticated;
