-- =============================================================================
-- Trace Mate — initial schema
-- Run once in Supabase SQL Editor (or via `supabase db push`). Idempotent.
-- =============================================================================

-- ── extensions ────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── enums ────────────────────────────────────────────────────────────────
do $$ begin
  create type subscription_plan as enum ('free', 'monthly', 'quarterly', 'lifetime');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subscription_status as enum ('active', 'on_hold', 'cancelled', 'expired', 'failed');
exception when duplicate_object then null; end $$;

-- ── profiles (1:1 with auth.users) ────────────────────────────────────────
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             text,
  display_name      text,
  avatar_url        text,
  dodo_customer_id  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists profiles_dodo_customer_id_idx on public.profiles (dodo_customer_id);

-- ── subscriptions ─────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id                            uuid primary key default uuid_generate_v4(),
  user_id                       uuid not null references public.profiles(id) on delete cascade,
  plan                          subscription_plan   not null default 'free',
  status                        subscription_status not null default 'active',
  current_period_end            timestamptz,
  cancel_at_next_billing_date   boolean not null default false,
  dodo_subscription_id          text,
  dodo_payment_id               text,
  amount_cents                  int,
  currency                      text,
  cancelled_at                  timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

-- Idempotent for existing installations: add the column if the table existed before this migration.
alter table public.subscriptions
  add column if not exists cancel_at_next_billing_date boolean not null default false;
create index if not exists subscriptions_user_id_idx       on public.subscriptions (user_id);
create index if not exists subscriptions_status_idx        on public.subscriptions (status);
create index if not exists subscriptions_dodo_sub_id_idx   on public.subscriptions (dodo_subscription_id);
-- Only one active subscription per user at a time.
create unique index if not exists subscriptions_one_active_per_user
  on public.subscriptions (user_id) where status = 'active';

-- ── webhook_events (audit + idempotency) ──────────────────────────────────
create table if not exists public.webhook_events (
  id              uuid primary key default uuid_generate_v4(),
  webhook_id      text unique,
  event_type      text not null,
  payload         jsonb not null,
  processed       boolean not null default false,
  error_message   text,
  attempts        int not null default 0,
  created_at      timestamptz not null default now(),
  processed_at    timestamptz
);
create index if not exists webhook_events_processed_idx  on public.webhook_events (processed, created_at);
create index if not exists webhook_events_event_type_idx on public.webhook_events (event_type);

-- ── updated_at trigger ────────────────────────────────────────────────────
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.tg_set_updated_at();

-- ── on signup: create profile + free subscription ─────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  -- Only insert a free subscription if this user has no rows at all yet.
  -- (We can't `on conflict do nothing` here — there's no plain unique
  -- constraint on user_id; the unique-active is partial. So we guard with
  -- a NOT EXISTS check instead of relying on conflict resolution.)
  insert into public.subscriptions (user_id, plan, status)
  select new.id, 'free', 'active'
  where not exists (
    select 1 from public.subscriptions where user_id = new.id
  );

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── lifetime spots helper (10 max) ────────────────────────────────────────
create or replace function public.lifetime_seats_left()
returns int language sql stable security definer set search_path = public as $$
  select greatest(0, 10 - (
    select count(*)::int from public.subscriptions
    where plan = 'lifetime' and status = 'active'
  ));
$$;
grant execute on function public.lifetime_seats_left() to anon, authenticated;

-- ── Row Level Security ────────────────────────────────────────────────────
alter table public.profiles       enable row level security;
alter table public.subscriptions  enable row level security;
alter table public.webhook_events enable row level security;

-- profiles: users can read + update their own row
drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = id);

-- subscriptions: users can read their own; writes only via service role (Edge Fn)
drop policy if exists "subscriptions_self_select" on public.subscriptions;
create policy "subscriptions_self_select" on public.subscriptions
  for select using (auth.uid() = user_id);

-- webhook_events: locked down. RLS with no policies already denies anon/authenticated,
-- but be explicit about it AND revoke base privileges so a future contributor who adds
-- a policy can't accidentally expose customer payloads. Service role bypasses all of this.
drop policy if exists "webhook_events_deny_all" on public.webhook_events;
create policy "webhook_events_deny_all" on public.webhook_events
  for all using (false) with check (false);
revoke all on public.webhook_events from anon, authenticated;

-- ── Rate limiting (used by Edge Functions to throttle abuse) ─────────────
-- Tiny token-bucket-ish counter keyed on a string `bucket`. The Edge Function
-- builds buckets like `sub-action:<user_id>` so each user has their own quota.
-- Atomic via row-level lock inside the function.
create table if not exists public.rate_limits (
  bucket             text primary key,
  count              int not null default 0,
  window_started_at  timestamptz not null default now()
);

create or replace function public.check_rate_limit(
  bucket_key      text,
  max_count       int,
  window_seconds  int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cur public.rate_limits%rowtype;
begin
  insert into public.rate_limits (bucket) values (bucket_key)
    on conflict (bucket) do nothing;

  select * into cur from public.rate_limits where bucket = bucket_key for update;

  if extract(epoch from (now() - cur.window_started_at)) > window_seconds then
    update public.rate_limits
       set count = 1, window_started_at = now()
     where bucket = bucket_key;
    return true;
  end if;

  if cur.count >= max_count then
    return false;
  end if;

  update public.rate_limits set count = count + 1 where bucket = bucket_key;
  return true;
end $$;

grant execute on function public.check_rate_limit(text, int, int) to authenticated, service_role;

alter table public.rate_limits enable row level security;
-- No policies — clients never read/write directly. Edge Functions go through
-- check_rate_limit (security definer) or use the service role.
drop policy if exists "rate_limits_deny_all" on public.rate_limits;
create policy "rate_limits_deny_all" on public.rate_limits
  for all using (false) with check (false);
revoke all on public.rate_limits from anon, authenticated;

-- ── Realtime: stream subscription updates to the owning user ─────────────
-- Lets the AuthProvider react instantly when a webhook flips a row to active.
do $$ begin
  alter publication supabase_realtime add table public.subscriptions;
exception when duplicate_object then null; end $$;
