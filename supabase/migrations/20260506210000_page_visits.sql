-- =============================================================================
-- Trace Mate — per-page visit history for the admin activity timeline
-- =============================================================================
-- Today the operator can see WHICH page a user is currently on (live
-- presence) and a few sparse "first occurrence" stamps from the journey
-- migration, but not the actual sequence of pages a user has visited.
-- A ghost user who hit /welcome → /pricing → /pricing → bounced reads
-- exactly the same as a ghost who only ever loaded /welcome — and the
-- two need different recovery moves.
--
-- This migration adds a per-user navigation log with a 30s server-side
-- dedupe window so React StrictMode double-mounts and rapid toggling
-- don't flood the table.
--
-- Volume: a user actively poking around might hit ~30-50 rows in a
-- session. The user_visited_idx keeps "newest 50 rows for user X" cheap
-- regardless of total table size. A cleanup cron can prune rows older
-- than 90 days later if needed; for now we keep everything since the
-- forensic value of "what did they do 60 days ago when they signed up?"
-- is high for a solo founder still learning their funnel.
-- =============================================================================

create table if not exists public.page_visits (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  page        text not null,
  image_label text,
  visited_at  timestamptz not null default now()
);

-- Newest-first lookup per user. Used by admin-user-activity to fetch the
-- last N rows for the timeline drill-down without scanning the whole table.
create index if not exists page_visits_user_visited_idx
  on public.page_visits (user_id, visited_at desc);

alter table public.page_visits enable row level security;

-- Self-read so a user could see their own history if we ever expose it.
-- Writes go through the security-definer RPC only — no insert policy,
-- so no client can backdate or attribute visits to other users.
drop policy if exists page_visits_self_read on public.page_visits;
create policy page_visits_self_read
  on public.page_visits
  for select
  using (auth.uid() = user_id);

-- ── record_page_visit ─────────────────────────────────────────────────────
-- Called by usePresence on every route mount. Inserts a row UNLESS the
-- caller's most recent page_visit was for the same page within the last
-- 30 seconds — that dedupe window absorbs StrictMode double-mounts and
-- rapid back/forward without losing genuine re-visits to the same route.
--
-- Fire-and-forget from the client; server enforces auth.uid() so an
-- unsigned caller never lands a row.
create or replace function public.record_page_visit(
  p_page        text,
  p_image_label text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_page   text;
  v_label  text;
  v_last   record;
begin
  if v_uid is null then return; end if;

  v_page  := nullif(trim(coalesce(p_page, '')), '');
  if v_page is null then return; end if;
  v_page  := left(v_page, 60);
  v_label := nullif(trim(coalesce(p_image_label, '')), '');
  if v_label is not null then v_label := left(v_label, 200); end if;

  -- 30s dedupe — same page repeated quickly is a remount, not a re-visit.
  select page, visited_at
    into v_last
    from public.page_visits
   where user_id = v_uid
   order by visited_at desc
   limit 1;

  if v_last.page = v_page and v_last.visited_at > now() - interval '30 seconds' then
    return;
  end if;

  insert into public.page_visits (user_id, page, image_label)
  values (v_uid, v_page, v_label);
end $$;

revoke all     on function public.record_page_visit(text, text) from public;
grant execute  on function public.record_page_visit(text, text) to authenticated;
