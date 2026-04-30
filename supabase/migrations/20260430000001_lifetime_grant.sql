-- =============================================================================
-- Trace Mate — atomic lifetime-grant function
-- =============================================================================
-- Wraps the seats-left check + cancel-prior-active + insert into a single
-- transaction protected by a transaction-scoped advisory lock. Without this
-- lock, two concurrent payment.succeeded webhooks can both observe seatsLeft=1
-- and both insert, pushing the lifetime cap above its advertised limit.
--
-- The lock is keyed on a single constant; only lifetime grants compete for it,
-- so this serializes lifetime issuance without affecting other writes.
-- pg_advisory_xact_lock is released automatically at transaction end.
-- =============================================================================

create or replace function public.grant_lifetime_subscription(
  p_user_id      uuid,
  p_payment_id   text,
  p_amount_cents int,
  p_currency     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id    uuid;
  v_active_count   int;
  v_seat_cap       constant int := 10;
  v_lock_key       constant bigint := 871234567;
  v_new_id         uuid;
begin
  if p_user_id is null or p_payment_id is null then
    raise exception 'p_user_id and p_payment_id are required';
  end if;

  -- Serialize all lifetime grants behind one transaction-scoped lock.
  perform pg_advisory_xact_lock(v_lock_key);

  -- Idempotency: a row already exists for this payment.
  select id into v_existing_id
    from public.subscriptions
   where dodo_payment_id = p_payment_id
   limit 1;
  if v_existing_id is not null then
    return jsonb_build_object('status', 'duplicate', 'subscription_id', v_existing_id);
  end if;

  -- Count active lifetimes under the lock — no other lifetime grant can race.
  select count(*)::int into v_active_count
    from public.subscriptions
   where plan = 'lifetime' and status = 'active';

  if v_active_count >= v_seat_cap then
    return jsonb_build_object('status', 'cap_reached');
  end if;

  -- Cancel any active row for this user so the unique-active partial index
  -- stays satisfied, then insert the lifetime row.
  update public.subscriptions
     set status = 'cancelled', cancelled_at = now()
   where user_id = p_user_id and status = 'active';

  insert into public.subscriptions
    (user_id, plan, status, current_period_end, dodo_payment_id, amount_cents, currency)
  values
    (p_user_id, 'lifetime', 'active', null, p_payment_id, p_amount_cents, p_currency)
  returning id into v_new_id;

  return jsonb_build_object('status', 'granted', 'subscription_id', v_new_id);
end $$;

-- Only the service role (used by Edge Functions) should call this. Keeping it
-- off anon/authenticated prevents any future RLS regression from exposing it.
revoke all on function public.grant_lifetime_subscription(uuid, text, int, text) from public;
grant execute on function public.grant_lifetime_subscription(uuid, text, int, text) to service_role;
