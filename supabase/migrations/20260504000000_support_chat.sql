-- =============================================================================
-- Trace Mate — support chat (user ↔ operator, branded as "TRACE AI")
-- =============================================================================
-- One-on-one threads between each user and the operator. Users see the
-- conversation as if they're chatting with an AI assistant; the admin
-- dashboard surfaces the same threads as a support inbox.
--
-- Design choices:
--   * One thread per user, ever (UNIQUE user_id). Closing/reopening is a UI
--     concern, not a DB one — keeps history continuous.
--   * Direct INSERT/UPDATE on threads + messages is denied; all writes go
--     through security-definer RPCs so the client can never spoof
--     sender_role or sender_id, and rate limiting + body validation live in
--     one auditable place.
--   * Read pointers (last_*_read_at) live on the thread row, not in a
--     separate "reads" table. Two integers vs an extra table is the right
--     tradeoff at this scale.
--   * Realtime is added to both tables so live updates stream over the same
--     publication the AuthProvider already subscribes to.
--
-- Idempotent. Purely additive — no ALTERs to existing tables, no policy
-- changes elsewhere.
-- =============================================================================

-- ── enum: sender role ────────────────────────────────────────────────────
do $$ begin
  create type support_sender_role as enum ('user', 'admin');
exception when duplicate_object then null; end $$;

-- ── support_threads (1:1 with users — UNIQUE user_id) ────────────────────
create table if not exists public.support_threads (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null unique references public.profiles(id) on delete cascade,
  last_message_at     timestamptz not null default now(),
  last_admin_read_at  timestamptz,
  last_user_read_at   timestamptz,
  created_at          timestamptz not null default now()
);

-- Admin sorts inbox by recency; users only ever query their own row.
create index if not exists support_threads_last_message_at_idx
  on public.support_threads (last_message_at desc);

-- ── support_messages ─────────────────────────────────────────────────────
create table if not exists public.support_messages (
  id           uuid primary key default uuid_generate_v4(),
  thread_id    uuid not null references public.support_threads(id) on delete cascade,
  sender_role  support_sender_role not null,
  -- Audit only. Nullable so a deleted admin profile doesn't wipe their
  -- replies (vs the user case, where the thread cascades anyway).
  sender_id    uuid references public.profiles(id) on delete set null,
  body         text not null check (length(btrim(body)) between 1 and 4000),
  created_at   timestamptz not null default now()
);

create index if not exists support_messages_thread_idx
  on public.support_messages (thread_id, created_at);

-- ── Row Level Security ───────────────────────────────────────────────────
alter table public.support_threads  enable row level security;
alter table public.support_messages enable row level security;

-- threads: SELECT for the owning user OR any admin. No INSERT/UPDATE/DELETE
-- policy → direct writes are denied; clients must use the RPCs below.
drop policy if exists "support_threads_select" on public.support_threads;
create policy "support_threads_select" on public.support_threads
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles
       where id = auth.uid() and is_admin = true
    )
  );

-- messages: SELECT when the caller owns the thread OR is admin. Same write
-- lockdown — RPCs are the only sanctioned write path.
drop policy if exists "support_messages_select" on public.support_messages;
create policy "support_messages_select" on public.support_messages
  for select using (
    exists (
      select 1 from public.support_threads t
       where t.id = support_messages.thread_id
         and (
           t.user_id = auth.uid()
           or exists (
             select 1 from public.profiles p
              where p.id = auth.uid() and p.is_admin = true
           )
         )
    )
  );

-- ── helper: is the caller an admin? ──────────────────────────────────────
-- Local to this migration so we don't spread admin-flag reads everywhere.
create or replace function public.is_caller_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_caller_admin() from public;
grant execute on function public.is_caller_admin() to authenticated;

-- ── RPC: start_support_thread() ──────────────────────────────────────────
-- Returns the caller's thread. Creates one if it doesn't exist yet. Admins
-- calling this for themselves get their own (empty) thread, which is
-- harmless — they don't have a customer-facing UI for it.
create or replace function public.start_support_thread()
returns public.support_threads
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

  select * into v_row from public.support_threads where user_id = v_uid;
  if found then
    return v_row;
  end if;

  insert into public.support_threads (user_id)
       values (v_uid)
  on conflict (user_id) do update set user_id = excluded.user_id  -- harmless self-touch on race
  returning * into v_row;

  return v_row;
end $$;

revoke all on function public.start_support_thread() from public;
grant execute on function public.start_support_thread() to authenticated;

-- ── RPC: send_support_message(thread_id, body) ───────────────────────────
-- Single write path for both sides. Resolves sender_role from is_admin (so
-- a user can never claim 'admin'), rate-limits non-admins, validates body,
-- and bumps the thread's last_message_at.
--
-- Returns the inserted message row id so the caller can match it against
-- the realtime broadcast (de-dupe optimistic UI insertions).
create or replace function public.send_support_message(
  p_thread_id uuid,
  p_body      text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_admin  boolean;
  v_thread public.support_threads%rowtype;
  v_role   support_sender_role;
  v_body   text;
  v_id     uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_body := btrim(coalesce(p_body, ''));
  if length(v_body) = 0 then
    raise exception 'Message is empty';
  end if;
  if length(v_body) > 4000 then
    raise exception 'Message is too long (max 4000 characters)';
  end if;

  select * into v_thread from public.support_threads where id = p_thread_id;
  if not found then
    raise exception 'Thread not found';
  end if;

  v_admin := public.is_caller_admin();

  -- Authorization: admin can write to any thread; a regular user only to
  -- their own. Reject anyone else (e.g. another regular user attempting to
  -- post into someone else's thread by guessing the id).
  if not v_admin and v_thread.user_id <> v_uid then
    raise exception 'Not authorized for this thread';
  end if;

  v_role := case when v_admin then 'admin'::support_sender_role
                 else              'user'::support_sender_role end;

  -- Rate limit ONLY non-admins. Bucket is per-user so flooding from one
  -- account doesn't punish anyone else. 30/min is generous for fast typing
  -- but blocks runaway scripts. Admin is trusted → unlimited.
  if not v_admin then
    if not public.check_rate_limit('support:' || v_uid::text, 30, 60) then
      raise exception 'You''re sending messages too quickly. Please wait a moment.';
    end if;
  end if;

  insert into public.support_messages (thread_id, sender_role, sender_id, body)
       values (p_thread_id, v_role, v_uid, v_body)
    returning id into v_id;

  update public.support_threads
     set last_message_at = now()
   where id = p_thread_id;

  return v_id;
end $$;

revoke all on function public.send_support_message(uuid, text) from public;
grant execute on function public.send_support_message(uuid, text) to authenticated;

-- ── RPC: mark_support_thread_read(thread_id) ─────────────────────────────
-- Bumps the appropriate read pointer based on whether the caller is the
-- thread's owning user or an admin. Idempotent — safe to call repeatedly
-- on every message render or focus event.
create or replace function public.mark_support_thread_read(
  p_thread_id uuid
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_admin  boolean;
  v_thread public.support_threads%rowtype;
  v_now    timestamptz := now();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_thread from public.support_threads where id = p_thread_id;
  if not found then
    raise exception 'Thread not found';
  end if;

  v_admin := public.is_caller_admin();

  if v_admin then
    update public.support_threads
       set last_admin_read_at = v_now
     where id = p_thread_id;
    return v_now;
  end if;

  if v_thread.user_id <> v_uid then
    raise exception 'Not authorized for this thread';
  end if;

  update public.support_threads
     set last_user_read_at = v_now
   where id = p_thread_id;

  return v_now;
end $$;

revoke all on function public.mark_support_thread_read(uuid) from public;
grant execute on function public.mark_support_thread_read(uuid) to authenticated;

-- ── RPC: list_support_threads() — admin-only inbox view ──────────────────
-- Joins thread + profile + last message + unread flag in one round-trip so
-- the admin dashboard can render the inbox without N+1 queries. Non-admins
-- get an empty result (same fail-quiet pattern as the rest of the app).
create or replace function public.list_support_threads()
returns table (
  thread_id        uuid,
  user_id          uuid,
  email            text,
  display_name     text,
  last_seen_at     timestamptz,
  created_at       timestamptz,
  last_message_at  timestamptz,
  last_admin_read_at timestamptz,
  last_message_body text,
  last_message_role support_sender_role,
  unread_for_admin boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id                                                 as thread_id,
    t.user_id                                            as user_id,
    p.email                                              as email,
    p.display_name                                       as display_name,
    p.last_seen_at                                       as last_seen_at,
    t.created_at                                         as created_at,
    t.last_message_at                                    as last_message_at,
    t.last_admin_read_at                                 as last_admin_read_at,
    lm.body                                              as last_message_body,
    lm.sender_role                                       as last_message_role,
    -- Unread iff the most recent USER message is newer than the admin's
    -- last read pointer. Admin's own replies don't trip the flag.
    coalesce(
      (
        select max(m.created_at) > coalesce(t.last_admin_read_at, 'epoch'::timestamptz)
          from public.support_messages m
         where m.thread_id = t.id and m.sender_role = 'user'
      ),
      false
    )                                                    as unread_for_admin
  from public.support_threads t
  join public.profiles p on p.id = t.user_id
  left join lateral (
    select body, sender_role
      from public.support_messages
     where thread_id = t.id
     order by created_at desc
     limit 1
  ) lm on true
  where public.is_caller_admin()
  order by t.last_message_at desc;
$$;

revoke all on function public.list_support_threads() from public;
grant execute on function public.list_support_threads() to authenticated;

-- ── Realtime: stream threads + messages to subscribed clients ────────────
-- RLS still applies on the receive side: a client only sees inserts on
-- rows it could SELECT, so the policies above already do the right thing.
do $$ begin
  alter publication supabase_realtime add table public.support_threads;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.support_messages;
exception when duplicate_object then null; end $$;
