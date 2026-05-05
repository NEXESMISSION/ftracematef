-- =============================================================================
-- Trace Mate — drop the "TRACE AI" support chat
-- =============================================================================
-- The user-↔-operator support chat is being removed. Reverses the two
-- 20260504* migrations cleanly:
--
--   1. Pull the tables off the realtime publication (otherwise the DROP
--      below leaves a dangling publication entry on some Postgres versions).
--   2. Drop the RPC functions.
--   3. Drop messages first, then threads (FK direction).
--   4. Drop the sender_role enum.
--
-- Idempotent — every drop uses IF EXISTS, every publication tweak is wrapped
-- in EXCEPTION handlers so a re-run on a partially-dropped DB is a no-op.
-- =============================================================================

-- ── Pull from realtime publication ───────────────────────────────────────────
do $$ begin
  alter publication supabase_realtime drop table public.support_messages;
exception
  when undefined_object then null;
  when undefined_table  then null;
end $$;

do $$ begin
  alter publication supabase_realtime drop table public.support_threads;
exception
  when undefined_object then null;
  when undefined_table  then null;
end $$;

-- ── Drop RPCs ───────────────────────────────────────────────────────────────
drop function if exists public.admin_start_support_thread_for_user(uuid);
drop function if exists public.list_support_threads();
drop function if exists public.mark_support_thread_read(uuid);
drop function if exists public.send_support_message(uuid, text);
drop function if exists public.start_support_thread();
drop function if exists public.is_caller_admin();

-- ── Drop tables (children first) ────────────────────────────────────────────
drop table if exists public.support_messages;
drop table if exists public.support_threads;

-- ── Drop the enum ───────────────────────────────────────────────────────────
drop type if exists public.support_sender_role;
