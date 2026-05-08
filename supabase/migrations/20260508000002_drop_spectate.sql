-- =============================================================================
-- Trace Mate — drop the admin spectate ("Watch live") feature
-- =============================================================================
-- Why
-- ────
-- The operator-side "Watch live" camera spectate was retired. This drops
-- everything the feature touched on the database side:
--   - trace_session_runs.spectate_token (per-session WebRTC channel key)
--   - trace_session_runs.broadcast_state / broadcast_state_at (the user's
--     /trace tab self-reporting why broadcasting was/wasn't happening)
--   - public.set_trace_broadcast_state(...) RPC (client → broadcast_state)
--   - the open-runs partial index that supported the spectate token lookup
--
-- start_trace_run is rewritten to return ONLY { run_id }. The previous
-- version returned { run_id, spectate_token } as jsonb; clients still
-- expect jsonb, so we keep that return shape (Trace.jsx already handles
-- both bare-uuid and { run_id } object responses).
--
-- live_pairing_tokens (user's own /live phone↔desktop pairing) is NOT
-- touched — it's a separate, still-active feature.
--
-- Idempotent — safe to re-run.
-- =============================================================================

-- ── Drop the helper RPC first (depends on broadcast_state column) ───────────
drop function if exists public.set_trace_broadcast_state(uuid, text);

-- ── Drop the open-runs index that pointed at spectate lookups ──────────────
drop index if exists public.trace_session_runs_open_token_idx;

-- ── Drop the spectate columns on trace_session_runs ────────────────────────
alter table public.trace_session_runs
  drop column if exists spectate_token,
  drop column if exists broadcast_state,
  drop column if exists broadcast_state_at;

-- ── Replace start_trace_run so it no longer mints a spectate_token ─────────
-- Drop+recreate (the previous version's body referenced spectate_token).
drop function if exists public.start_trace_run(text);

create function public.start_trace_run(p_image_label text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_now   timestamptz := now();
  v_id    uuid;
  v_label text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_label := nullif(trim(coalesce(p_image_label, '')), '');
  if v_label is not null and length(v_label) > 200 then
    v_label := left(v_label, 200);
  end if;

  -- Reconcile any stragglers from prior crashes / hard kills before we
  -- open a fresh row.
  perform public.reconcile_trace_runs_for_user(v_uid, 0);

  insert into public.trace_session_runs (user_id, image_label)
  values (v_uid, v_label)
  returning id into v_id;

  update public.profiles
     set trace_sessions = trace_sessions + 1,
         first_trace_at = coalesce(first_trace_at, v_now),
         last_trace_at  = v_now,
         last_seen_at   = v_now,
         current_page   = 'trace',
         current_image_label = v_label,
         current_run_id = v_id
   where id = v_uid;

  return jsonb_build_object('run_id', v_id);
end $$;

revoke all on function public.start_trace_run(text) from public;
grant execute on function public.start_trace_run(text) to authenticated;
