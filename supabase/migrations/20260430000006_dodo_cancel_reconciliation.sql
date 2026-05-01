-- =============================================================================
-- Trace Mate — track recurring subs that need a remote Dodo cancel
-- =============================================================================
-- Closes the orphan-billing gap on Lifetime upgrades:
--
--   Flow: a user with an active monthly/quarterly sub buys Lifetime →
--   payment.succeeded webhook fires → grant_lifetime_subscription marks the
--   old recurring row 'cancelled' locally → webhook tries to cancel the sub
--   *remotely* at Dodo so the card stops getting charged.
--
--   That remote cancel call is currently best-effort (try/catch around the
--   Dodo API call). If it fails — network blip, expired API key, Dodo
--   outage, rate limit — the local row is cancelled but the customer
--   keeps getting billed for the recurring plan they thought they
--   replaced. The error only surfaces in function logs, and ops has to
--   read the logs to find these.
--
-- This migration adds:
--   - `needs_dodo_cancel boolean` flag set by the webhook when the Dodo
--     cancel call fails. Indexed for cheap "show me everything that needs
--     a retry" queries.
--   - `retry_pending_dodo_cancels()` RPC that retrieves the list of
--     subscriptions still flagged. The webhook handler / a future cron
--     job can iterate this list, retry the Dodo cancel, and clear the
--     flag on success.
--
-- The actual retry HTTP call still happens in the edge function (this
-- function is just the source-of-truth for "what's pending"). Keeping the
-- HTTP side out of SQL also keeps the migration purely additive.
-- =============================================================================

alter table public.subscriptions
  add column if not exists needs_dodo_cancel boolean not null default false;

-- Partial index — only the (small) set of rows that actually need retry
-- shows up. Cheaper than a full-table index and self-pruning.
create index if not exists subscriptions_needs_dodo_cancel_idx
  on public.subscriptions (needs_dodo_cancel)
  where needs_dodo_cancel = true;

-- Returns rows that still need a remote Dodo cancel, oldest first.
-- Service-role-only — clients don't need to see this.
create or replace function public.list_pending_dodo_cancels()
returns table (
  id                    uuid,
  user_id               uuid,
  dodo_subscription_id  text,
  cancelled_at          timestamptz,
  updated_at            timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, user_id, dodo_subscription_id, cancelled_at, updated_at
    from public.subscriptions
   where needs_dodo_cancel = true
     and dodo_subscription_id is not null
   order by cancelled_at asc nulls last
   limit 100;
$$;

revoke all on function public.list_pending_dodo_cancels() from public;
grant execute on function public.list_pending_dodo_cancels() to service_role;
