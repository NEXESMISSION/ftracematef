-- ============================================================================
-- Fix: rate-limit guard calls used the wrong argument type + global buckets
-- ============================================================================
-- Migration ...009 called check_rate_limit(text, int, interval). The real
-- signature is check_rate_limit(p_bucket text, p_max_calls int,
-- p_window_seconds int) — the window is INTEGER SECONDS, not an interval. The
-- bad call can't resolve at runtime, so the BEFORE INSERT triggers threw on
-- EVERY publish/like → "could not publish" for normal users.
--
-- It also used a single global bucket ('publish_creation') instead of a
-- per-user key, which would have rate-limited all users collectively. Mirror
-- the proven pattern from migration ...009: 'bucket:' || auth.uid()::text,
-- seconds as int. Soft-fail (no-op) instead of raising, matching the other
-- rate-limited paths — a blocked write should degrade quietly, not error in
-- the user's face.
--
-- Idempotent.

-- ── Publish guard ───────────────────────────────────────────────────────────
create or replace function public.creations_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 20 published creations / hour, per user. Over the cap → block this one
  -- with a friendly message (publishing is deliberate, so a hard stop here is
  -- clearer than a silent no-op that looks like success).
  if not public.check_rate_limit('publish_creation:' || coalesce(auth.uid()::text, 'anon'), 20, 3600) then
    raise exception 'You are posting too fast. Please wait a bit and try again.'
      using errcode = 'check_violation';
  end if;
  if new.note is not null then
    new.note := nullif(left(btrim(new.note), 200), '');
  end if;
  return new;
end;
$$;

-- ── Like guard ──────────────────────────────────────────────────────────────
create or replace function public.creation_likes_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 120 likes / minute, per user. Over the cap → drop this like silently
  -- (a missed like is invisible; the optimistic UI just won't persist).
  if not public.check_rate_limit('toggle_like:' || coalesce(auth.uid()::text, 'anon'), 120, 60) then
    return null;  -- skip the INSERT, no error surfaced to the client
  end if;
  return new;
end;
$$;

-- ── Report RPC (same bad call) ──────────────────────────────────────────────
create or replace function public.report_creation(p_creation_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.check_rate_limit('report_creation:' || v_uid::text, 30, 3600) then
    raise exception 'Too many reports. Please slow down.' using errcode = 'check_violation';
  end if;

  insert into public.creation_reports (creation_id, reporter_id, reason)
  values (p_creation_id, v_uid, nullif(left(btrim(coalesce(p_reason, '')), 300), ''))
  on conflict (creation_id, reporter_id) do nothing;

  select count(*) into v_count from public.creation_reports where creation_id = p_creation_id;
  if v_count >= 3 then
    update public.creations set hidden = true where id = p_creation_id;
  end if;
end;
$$;
