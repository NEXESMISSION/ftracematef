-- =============================================================================
-- Trace Mate — referral / affiliate commission system
-- =============================================================================
-- A partner ("referrer") gets a unique link tracemate.art/i/<code>. When a
-- visitor clicks it, the SPA stamps the code first-touch to a cookie +
-- localStorage (see lib/attribution.js). On first sign-in, AuthProvider calls
-- record_referral(code), permanently tagging the new profile with that
-- referrer (profiles.referred_by). When that user later PAYS — the first
-- charge AND every renewal — the dodo-webhook books a row in
-- referral_commissions so the operator can see what each partner is owed and
-- mark it paid.
--
-- This is a SEPARATE dimension from signup_source (marketing-channel
-- attribution). A user can have both a signup_source = 'tiktok' and a
-- referred_by partner; they answer different questions and never collide.
--
-- Commission model (both supported, per-referrer):
--   - commission_rate_bps : percentage in basis points (2000 = 20%). Default.
--   - commission_flat_cents: optional flat override. When set, the partner
--     earns this exact amount per sale regardless of the order value.
-- =============================================================================

-- gen_random_uuid() is built into Postgres core (no extension needed). We use
-- it instead of uuid_generate_v4() because the uuid-ossp extension lives in
-- the `extensions` schema, which isn't on the migration runner's search_path.
do $$ begin
  create type referral_commission_status as enum ('pending', 'paid', 'void');
exception when duplicate_object then null; end $$;

-- ── referrers (affiliates / partners) ──────────────────────────────────────
create table if not exists public.referrers (
  id                     uuid primary key default gen_random_uuid(),
  code                   text not null,
  name                   text,
  email                  text,
  -- 2000 bps = 20%. Used unless commission_flat_cents is set.
  commission_rate_bps    int  not null default 2000,
  -- Optional flat override (in cents). NULL = use the percentage above.
  commission_flat_cents  int,
  active                 boolean not null default true,
  -- Opaque token the partner uses to view their own stats at
  -- /partner?t=<token> without needing an account. Rotate by updating it.
  access_token           uuid not null default gen_random_uuid(),
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
-- Codes are matched case-insensitively, so enforce uniqueness on lower(code).
create unique index if not exists referrers_code_lower_idx on public.referrers (lower(code));
create unique index if not exists referrers_access_token_idx on public.referrers (access_token);

drop trigger if exists referrers_set_updated_at on public.referrers;
create trigger referrers_set_updated_at before update on public.referrers
  for each row execute function public.tg_set_updated_at();

-- ── profiles.referred_by (first-touch affiliate attribution) ────────────────
alter table public.profiles
  add column if not exists referred_by uuid references public.referrers(id) on delete set null,
  add column if not exists referred_at timestamptz;
create index if not exists profiles_referred_by_idx on public.profiles (referred_by);

-- Lock the new columns down like the other journey/attribution columns — only
-- the security-definer record_referral RPC may write them, never a client
-- PATCH (which would let a user re-assign their own referrer to game payouts).
revoke update (referred_by, referred_at) on public.profiles from authenticated, anon;

-- ── referral_commissions (one row per paid charge) ──────────────────────────
create table if not exists public.referral_commissions (
  id                    uuid primary key default gen_random_uuid(),
  referrer_id           uuid not null references public.referrers(id) on delete cascade,
  user_id               uuid references public.profiles(id) on delete set null,
  -- Idempotency key built by the webhook from the underlying charge so retries
  -- and re-processed events can't double-book. One row per real charge:
  --   lifetime payment : 'pay:<payment_id>'
  --   sub first/renewal: 'sub:<subscription_id>:<period_end>'
  charge_key            text not null unique,
  event_type            text not null,
  sale_amount_cents     int,
  currency              text,
  commission_cents      int  not null default 0,
  status                referral_commission_status not null default 'pending',
  dodo_payment_id       text,
  dodo_subscription_id  text,
  created_at            timestamptz not null default now(),
  paid_at               timestamptz
);
create index if not exists referral_commissions_referrer_idx
  on public.referral_commissions (referrer_id, created_at desc);
create index if not exists referral_commissions_status_idx
  on public.referral_commissions (status);

-- ── RLS: clients never touch these directly ─────────────────────────────────
-- All reads/writes go through security-definer RPCs (for the authenticated
-- signup stamp) or the service role (Edge Functions for the operator + the
-- partner self-view). Deny everything else explicitly.
alter table public.referrers           enable row level security;
alter table public.referral_commissions enable row level security;

drop policy if exists referrers_deny_all on public.referrers;
create policy referrers_deny_all on public.referrers for all using (false) with check (false);
revoke all on public.referrers from anon, authenticated;

drop policy if exists referral_commissions_deny_all on public.referral_commissions;
create policy referral_commissions_deny_all on public.referral_commissions for all using (false) with check (false);
revoke all on public.referral_commissions from anon, authenticated;

-- ── record_referral: first-touch stamp at signup ───────────────────────────
-- Called by the freshly-signed-in user. Idempotent: only writes when the
-- profile has no referrer yet, and only for an active referrer code. A no-op
-- for organic signups or unknown/disabled codes.
create or replace function public.record_referral(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ref uuid;
begin
  if v_uid is null then return; end if;
  if p_code is null or length(btrim(p_code)) = 0 then return; end if;

  select id into v_ref
    from public.referrers
   where lower(code) = lower(btrim(p_code))
     and active = true
   limit 1;
  if v_ref is null then return; end if;

  update public.profiles
     set referred_by = v_ref,
         referred_at = now()
   where id = v_uid
     and referred_by is null;
end $$;

revoke all    on function public.record_referral(text) from public;
grant execute on function public.record_referral(text) to authenticated;

-- ── get_referral_stats: operator rollup (service role only) ─────────────────
-- One jsonb array, one element per referrer, with signup + sale + commission
-- aggregates. Called by the admin-referrals Edge Function under the service
-- role; never exposed to clients.
create or replace function public.get_referral_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  from (
    select
      r.id,
      r.code,
      r.name,
      r.email,
      r.commission_rate_bps,
      r.commission_flat_cents,
      r.active,
      r.access_token,
      r.notes,
      r.created_at,
      (select count(*) from public.profiles p where p.referred_by = r.id) as signups,
      (select count(*) from public.profiles p
         join public.subscriptions s
           on s.user_id = p.id and s.status = 'active' and s.plan <> 'free'
        where p.referred_by = r.id) as paying_now,
      coalesce((select count(*) from public.referral_commissions c
                 where c.referrer_id = r.id and c.status <> 'void'), 0) as sales,
      coalesce((select sum(c.sale_amount_cents) from public.referral_commissions c
                 where c.referrer_id = r.id and c.status <> 'void'), 0) as gross_cents,
      coalesce((select sum(c.commission_cents) from public.referral_commissions c
                 where c.referrer_id = r.id and c.status <> 'void'), 0) as commission_total_cents,
      coalesce((select sum(c.commission_cents) from public.referral_commissions c
                 where c.referrer_id = r.id and c.status = 'pending'), 0) as commission_pending_cents,
      coalesce((select sum(c.commission_cents) from public.referral_commissions c
                 where c.referrer_id = r.id and c.status = 'paid'), 0) as commission_paid_cents
    from public.referrers r
    order by r.created_at desc
  ) t;
$$;

revoke all    on function public.get_referral_stats() from public;
grant execute on function public.get_referral_stats() to service_role;
