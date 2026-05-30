// Supabase Edge Function: dodo-webhook
// ─────────────────────────────────────────────────────────────────────────────
// Receives webhook events from Dodo Payments. Uses the official SDK's
// `webhooks.unwrap()` to verify the StandardWebhooks signature and parse the
// payload in one call. Dedupes via webhook ID, logs to webhook_events, and
// upserts the user's subscription row.
//
// Dashboard config:
//   Webhook URL:  https://<project-ref>.supabase.co/functions/v1/dodo-webhook
//   Subscribe to: subscription.active, subscription.renewed, subscription.updated,
//                 subscription.plan_changed, subscription.cancelled,
//                 subscription.on_hold, subscription.expired, subscription.failed,
//                 payment.succeeded   (covers one-time lifetime purchases)
//
// Required Edge Function secrets:
//   DODO_API_KEY              — server-side API key (used by the SDK to verify)
//   DODO_WEBHOOK_SECRET       — the signing secret from the Dodo dashboard
//   DODO_ENVIRONMENT          — "test_mode" | "live_mode"
//   DODO_PRODUCT_*            — product IDs so we can map to plan names
//   DODO_PRICE_<PLAN>_CENTS_<CCY>  — per-currency price floors. Configure
//                                    one per (plan, currency) pair you accept,
//                                    e.g. DODO_PRICE_MONTHLY_CENTS_USD=700,
//                                    DODO_PRICE_MONTHLY_CENTS_EUR=560. A
//                                    currency without a configured floor is
//                                    rejected — events from new regions need
//                                    a config change, not a code change.
//   DODO_PRICE_<PLAN>_CENTS   — legacy single-currency floor. Still honored
//                                    when no per-currency floor exists for
//                                    the plan (paired with DODO_EXPECTED_CURRENCY,
//                                    default "USD") so existing deployments
//                                    keep working until they migrate.
//   DODO_EXPECTED_CURRENCY    — legacy: which currency the legacy CENTS floor
//                                    applies to. Ignored when per-currency
//                                    floors are configured.
// (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-provided)
// ─────────────────────────────────────────────────────────────────────────────

import { Webhook } from 'npm:standardwebhooks@1.0.0';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import DodoPayments from 'npm:dodopayments@1';

// Lazy-init the Dodo SDK so a missing API key only fails the helpers that
// actually need it, not webhook signature verification.
function dodoClient(): InstanceType<typeof DodoPayments> {
  const apiKey = Deno.env.get('DODO_API_KEY');
  if (!apiKey) throw new Error('DODO_API_KEY missing');
  return new DodoPayments({
    bearerToken: apiKey,
    environment: (Deno.env.get('DODO_ENVIRONMENT') ?? 'test_mode') as
      | 'test_mode'
      | 'live_mode',
  });
}

// PRODUCT_ID → plan name map. We skip blanks so missing env vars can't
// accidentally match an empty product_id from a malformed event.
const PLAN_FROM_PRODUCT: Record<string, string> = {};
{
  const monthly   = Deno.env.get('DODO_PRODUCT_MONTHLY');
  const quarterly = Deno.env.get('DODO_PRODUCT_QUARTERLY');
  const lifetime  = Deno.env.get('DODO_PRODUCT_LIFETIME');
  if (monthly)   PLAN_FROM_PRODUCT[monthly]   = 'monthly';
  if (quarterly) PLAN_FROM_PRODUCT[quarterly] = 'quarterly';
  if (lifetime)  PLAN_FROM_PRODUCT[lifetime]  = 'lifetime';
}

// Plan → currency → minimum cents we'll accept on an event for that plan.
// Reading from env keeps the webhook authoritative on what each plan should
// cost, independent of whatever a stray event claims. An event whose amount
// disagrees is rejected and the user's plan stays put — so a tampered or
// replayed event carrying the wrong product_id can't silently upgrade.
//
// Multi-currency by design. Set one floor per (plan, currency) pair you
// accept; new regions only need a config change, not a code edit:
//   DODO_PRICE_MONTHLY_CENTS_USD=700
//   DODO_PRICE_MONTHLY_CENTS_EUR=560
//   DODO_PRICE_QUARTERLY_CENTS_USD=1000
//   DODO_PRICE_QUARTERLY_CENTS_EUR=800
//   DODO_PRICE_LIFETIME_CENTS_USD=2500
// A currency the operator hasn't configured for a plan is treated as not
// allowlisted and the event is rejected — that's the right default, since
// we can't validate "is this enough money" without knowing the floor.
//
// Legacy fallback: deployments that still set DODO_PRICE_<PLAN>_CENTS (no
// currency suffix) get that value mapped to DODO_EXPECTED_CURRENCY (default
// USD) — but only when the plan has no per-currency floor set, so the new
// vars always win once configured. This keeps existing setups working
// through the rollout window.
//
// FAIL CLOSED. A plan with zero configured floors throws on every paid
// event for that plan. There is no opt-out: every paid plan MUST have at
// least one positive floor set, or payments don't process.
const SUPPORTED_PLANS = ['monthly', 'quarterly', 'lifetime'] as const;
type Plan = typeof SUPPORTED_PLANS[number];

const PLAN_FLOORS: Record<Plan, Record<string, number>> = (() => {
  const out: Record<Plan, Record<string, number>> = {
    monthly: {}, quarterly: {}, lifetime: {},
  };
  // 1. Per-currency floors — DODO_PRICE_<PLAN>_CENTS_<CCY>=<n>. Always win.
  const RE = /^DODO_PRICE_(MONTHLY|QUARTERLY|LIFETIME)_CENTS_([A-Z]{3})$/;
  for (const [name, raw] of Object.entries(Deno.env.toObject())) {
    const m = name.match(RE);
    if (!m) continue;
    const cents = parseInt(raw, 10);
    if (!Number.isFinite(cents) || cents <= 0) continue;
    out[m[1].toLowerCase() as Plan][m[2].toUpperCase()] = cents;
  }
  // 2. Legacy fallback — only used for plans with no per-currency floor yet.
  const legacyCcy = (Deno.env.get('DODO_EXPECTED_CURRENCY') ?? 'USD').toUpperCase();
  for (const plan of SUPPORTED_PLANS) {
    if (Object.keys(out[plan]).length > 0) continue;
    const raw = Deno.env.get(`DODO_PRICE_${plan.toUpperCase()}_CENTS`);
    if (!raw) continue;
    const cents = parseInt(raw, 10);
    if (Number.isFinite(cents) && cents > 0) out[plan][legacyCcy] = cents;
  }
  return out;
})();

// Throws if `amount` / `currency` don't match what we expect for `plan`.
// Pre-tax amounts can be slightly less than the headline price in regions
// that add tax on top, so we treat the env value as a *minimum*.
//
// Error messages name what's missing/wrong so an operator looking at the
// webhook_events.error_message column gets a self-explanatory diagnosis.
function assertExpectedAmount(plan: string, amountCents: unknown, currency: unknown) {
  const floors = PLAN_FLOORS[plan as Plan];
  if (!floors || Object.keys(floors).length === 0) {
    throw new Error(
      `Amount validation refused for plan ${plan}: no DODO_PRICE_${plan.toUpperCase()}_CENTS_<CCY> env var configured. ` +
      `Set at least one (e.g. DODO_PRICE_${plan.toUpperCase()}_CENTS_USD=...) and redeploy. ` +
      `Refusing to process payment events without a price floor.`,
    );
  }
  const ccy = String(currency ?? '').toUpperCase();
  if (!ccy) {
    throw new Error(
      `Currency missing on event for plan ${plan}: cannot validate amount without a currency`,
    );
  }
  const floor = floors[ccy];
  if (floor == null) {
    throw new Error(
      `Currency ${ccy} not allowlisted for plan ${plan}: ` +
      `set DODO_PRICE_${plan.toUpperCase()}_CENTS_${ccy} on the Supabase project secrets to accept it. ` +
      `Currently allowed: ${Object.keys(floors).sort().join(', ')}`,
    );
  }
  const got = typeof amountCents === 'number' ? amountCents : Number(amountCents);
  if (!Number.isFinite(got) || got < floor) {
    throw new Error(
      `Amount validation failed for plan ${plan} ${ccy}: got ${amountCents}, expected >= ${floor}`,
    );
  }
}

// Event types that REPRESENT real money moving (or first-time activation).
// These are the only events allowed to BIND a fresh dodo_customer_id to a
// profile. A subscription.failed / subscription.updated arriving first
// must NOT be allowed to perform first-time linkage — without this filter,
// a signed-but-crafted-metadata event whose `supabase_user_id` points at a
// victim's profile could bind the attacker's customer_id to the victim,
// routing all subsequent portal/payment lookups through the wrong account.
const POSITIVE_BIND_EVENTS = new Set([
  'subscription.active',
  'subscription.renewed',
  'payment.succeeded',
]);

// Reject events whose `customer_id` doesn't match a customer we've already
// linked to this profile. Once a profile has a `dodo_customer_id`, every
// subsequent event for that user MUST carry the same id — otherwise we're
// being asked to act on behalf of a different paying customer (most likely a
// replay/forged-metadata attempt).
//
// First-time linkage is now restricted to POSITIVE_BIND_EVENTS — see the
// comment on that set. Lifecycle/failure events that arrive for a not-yet-
// bound profile are silently allowed to proceed without binding (the next
// positive event will do the linkage), since they neither grant access nor
// move money.
async function bindAndCheckCustomer(
  supabase: any,
  userId: string,
  eventCustomerId: string | null | undefined,
  eventType: string,
) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('dodo_customer_id')
    .eq('id', userId)
    .maybeSingle();

  const existing = profile?.dodo_customer_id ?? null;
  if (existing && eventCustomerId && existing !== eventCustomerId) {
    throw new Error(
      `Customer mismatch for user ${userId}: profile=${existing} event=${eventCustomerId}`,
    );
  }
  if (!existing && eventCustomerId && POSITIVE_BIND_EVENTS.has(eventType)) {
    // First-time linkage. Use `is null` as the WHERE so a concurrent webhook
    // for the same user can't overwrite an already-set value.
    await supabase
      .from('profiles')
      .update({ dodo_customer_id: eventCustomerId })
      .eq('id', userId)
      .is('dodo_customer_id', null);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const webhookKey = Deno.env.get('DODO_WEBHOOK_SECRET');
  if (!webhookKey) return new Response('Server misconfigured', { status: 500 });

  const id        = req.headers.get('webhook-id')        ?? '';
  const signature = req.headers.get('webhook-signature') ?? '';
  const timestamp = req.headers.get('webhook-timestamp') ?? '';
  const rawBody   = await req.text();

  // ── 1. Verify the StandardWebhooks signature ─────────────────────────
  // Using the official `standardwebhooks` library directly (Dodo follows
  // the Standard Webhooks spec). This is what Dodo's Express.js example
  // shows — more reliable than the SDK's helper, which only exists on
  // newer SDK versions.
  const wh = new Webhook(webhookKey);
  let event: any;
  try {
    event = await wh.verify(rawBody, {
      'webhook-id':        id,
      'webhook-signature': signature,
      'webhook-timestamp': timestamp,
    });
    // `verify` returns the parsed JSON payload (already validated).
    if (typeof event === 'string') event = JSON.parse(event);
  } catch (err) {
    console.error('Invalid webhook signature:', err);
    return new Response('Invalid signature', { status: 401 });
  }

  // Reject events without an id — they bypass dedupe and risk double-processing.
  if (!id) {
    console.warn('Webhook rejected: missing webhook-id header');
    return new Response('Missing webhook-id', { status: 400 });
  }

  // ── 2. Init service-role client (bypasses RLS for writes) ────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // ── 3. Atomic claim: try to INSERT a new audit row. The unique index on
  //      webhook_id makes this race-safe: exactly one concurrent invocation
  //      gets the insert; the others get a unique-violation and look up state.
  const { data: claimed, error: claimErr } = await supabase
    .from('webhook_events')
    .insert({
      webhook_id: id,
      event_type: event.type ?? 'unknown',
      payload:    event,
      processed:  false,
    })
    .select('id, attempts')
    .single();

  let logged = claimed;

  if (claimErr) {
    // 23505 = unique_violation → another invocation already claimed this id.
    if ((claimErr as any).code !== '23505') {
      console.error('webhook_events insert failed:', claimErr);
      return new Response('Audit log failed', { status: 500 });
    }
    const { data: existing } = await supabase
      .from('webhook_events')
      .select('id, processed, attempts')
      .eq('webhook_id', id)
      .maybeSingle();
    if (existing?.processed) {
      return new Response(JSON.stringify({ received: true, deduped: true }), { status: 200 });
    }
    // Row exists but not yet processed. Two reasons we get here:
    //   (a) A previous attempt ran but threw — `attempts` was bumped, no other
    //       worker is in flight. We MUST re-process this retry so transient
    //       failures (e.g. a Dodo refund call that timed out) get another go.
    //       Without this, a payment that was charged but failed to refund
    //       sits stuck forever: every retry hits the duplicate guard and
    //       returns 409 without ever reattempting.
    //   (b) A truly concurrent invocation is in flight right now. Returning
    //       409 here prevents the double-process. We can't perfectly tell
    //       (a) from (b) — but in practice Dodo retries are spaced minutes
    //       apart, so an `attempts >= 1` row is far more likely to be (a).
    //       Downstream operations are individually idempotent (lifetime grant
    //       keyed on payment_id, Dodo refund keyed on payment_id), so even in
    //       the rare overlap of (a) and (b) we can't double-charge or
    //       double-grant — at worst we do the same idempotent work twice.
    if ((existing?.attempts ?? 0) === 0) {
      return new Response('In-flight, retry later', { status: 409 });
    }
    // Re-claim by re-using the existing row. Treat it as "logged" for the
    // post-process write so we update `processed` / `attempts` correctly.
    logged = { id: existing!.id, attempts: existing!.attempts ?? 0 };
  }

  // ── 4. Process by event type ─────────────────────────────────────────
  try {
    await processEvent(event, supabase, id);
    if (logged?.id) {
      await supabase
        .from('webhook_events')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('id', logged.id);
    }
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (err) {
    console.error('Webhook processing error:', err);
    if (logged?.id) {
      await supabase
        .from('webhook_events')
        .update({
          error_message: String((err as Error)?.message ?? err),
          attempts: (logged.attempts ?? 0) + 1,
        })
        .eq('id', logged.id);
    }
    // Return 500 so Dodo retries.
    return new Response('Processing error', { status: 500 });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Event handlers
// ─────────────────────────────────────────────────────────────────────────

async function processEvent(event: any, supabase: any, webhookId: string) {
  const type = event.type as string | undefined;
  if (!type) return;

  // Both subscription.* and payment.* events live in event.data
  const data = event.data ?? {};
  const userId =
    data.metadata?.supabase_user_id ??
    data.subscription?.metadata?.supabase_user_id ??
    data.payment?.metadata?.supabase_user_id;

  if (!userId) {
    // For non-paying events (e.g. subscription.updated emitted on a record we
    // can't link to a user) silent-skip is fine — no money is at stake.
    // For payment.succeeded, however, the customer paid us money and we
    // can't grant entitlements without knowing who they are. Throw so the
    // event is recorded in webhook_events.error_message — ops needs to see
    // this and refund/repair manually.
    if (type === 'payment.succeeded') {
      const paymentId = data.payment_id ?? data.id ?? '<unknown>';
      throw new Error(
        `payment.succeeded missing supabase_user_id metadata for payment ${paymentId} — manual refund required`,
      );
    }
    console.warn(`No supabase_user_id in metadata for event ${type} — skipping`);
    return;
  }

  // Bind / verify the Dodo customer id on the profile. After the first
  // event we've seen for this user, every subsequent event must carry the
  // same customer_id — a mismatched one is treated as a forged or
  // misrouted event and the handler throws (event ends up in
  // webhook_events.error_message for ops review, not silently honored).
  const customerId = data.customer?.customer_id ?? data.customer_id ?? null;
  await bindAndCheckCustomer(supabase, userId, customerId, type);

  switch (type) {
    case 'subscription.active':
    case 'subscription.renewed':
    case 'subscription.plan_changed':
    case 'subscription.updated': {
      await upsertActiveSubscription(type, data, userId, supabase);
      // Affiliate commission: only real charges (first activation + each
      // renewal) earn a payout — plan_changed / metadata updates do NOT, so a
      // partner can't be paid twice for the same cycle. Idempotent on
      // charge_key. Never throws (see helper) so payment processing is never
      // blocked by the referral subsystem.
      if (type === 'subscription.active' || type === 'subscription.renewed') {
        const subId     = data.subscription_id ?? data.id ?? null;
        const periodEnd = data.next_billing_date ?? data.current_period_end ?? null;
        const chargeKey = subId
          ? `sub:${subId}:${periodEnd ?? webhookId}`
          : `whid:${webhookId}`;
        await bookReferralCommission(supabase, userId, {
          chargeKey,
          eventType:      type,
          amountCents:    data.recurring_pre_tax_amount ?? data.amount ?? null,
          currency:       data.currency ?? null,
          subscriptionId: subId,
          paymentId:      data.payment_id ?? null,
        });
      }
      return;
    }

    case 'subscription.on_hold':
    case 'subscription.failed':
    case 'subscription.expired':
    case 'subscription.cancelled': {
      await markSubscriptionInactive(type, data, userId, supabase);
      return;
    }

    case 'payment.succeeded': {
      // Used for one-time payments (Lifetime)
      const productId = data.product_cart?.[0]?.product_id ?? data.product_id;
      const plan      = PLAN_FROM_PRODUCT[productId];
      if (plan !== 'lifetime') return;   // ignore other one-time products

      // Pin to `payment_id` only. The fallback to `data.id` was unsafe — Dodo
      // retries can populate one or the other, and dedupe must compare apples
      // to apples. If `payment_id` is genuinely missing the event is malformed
      // and we refuse to grant Lifetime without a way to dedupe.
      const paymentId: string | null = data.payment_id ?? null;
      if (!paymentId) {
        throw new Error('payment.succeeded missing payment_id — refusing to grant Lifetime without idempotency key');
      }

      // Validate the amount/currency against what we expect for Lifetime.
      // Without this, a `payment.succeeded` event whose product_id maps to
      // Lifetime but whose total_amount is $0 or in a different currency
      // would still grant Lifetime. Throw → event lands in
      // webhook_events.error_message and ops investigates / refunds manually.
      const lifetimeAmount   = data.total_amount ?? data.amount ?? null;
      const lifetimeCurrency = data.currency ?? null;
      assertExpectedAmount('lifetime', lifetimeAmount, lifetimeCurrency);

      // Capture any active recurring sub BEFORE the SQL function cancels it
      // locally — we still need its dodo_subscription_id to cancel remotely.
      const { data: priorActive } = await supabase
        .from('subscriptions')
        .select('id, dodo_subscription_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .not('dodo_subscription_id', 'is', null)
        .maybeSingle();

      // Atomic seats-check + cancel-prior + insert under an advisory lock,
      // wrapped in a single Postgres function. Returns one of:
      //   { status: 'duplicate' }     — same payment_id already provisioned
      //   { status: 'cap_reached' }   — lifetime cap full at commit-time
      //   { status: 'granted', ... }  — row inserted
      const { data: result, error: rpcErr } = await supabase.rpc(
        'grant_lifetime_subscription',
        {
          p_user_id:      userId,
          p_payment_id:   paymentId,
          p_amount_cents: data.total_amount ?? data.amount ?? null,
          p_currency:     data.currency ?? 'USD',
        },
      );
      if (rpcErr) {
        throw new Error(`grant_lifetime_subscription failed: ${rpcErr.message}`);
      }

      if (result?.status === 'duplicate') return;

      if (result?.status === 'cap_reached') {
        // Refund at Dodo so the customer isn't charged for nothing. The refund
        // call is itself idempotent on Dodo's side keyed by payment_id, so
        // retries are safe. Return normally — we processed the event by issuing
        // a refund; throwing would leave the audit row stuck unprocessed and
        // burn Dodo's retry budget.
        try {
          await refundDodoPayment(paymentId);
        } catch (err) {
          // If the refund itself fails, throw — Dodo should retry the event so
          // ops gets another chance to refund automatically.
          console.error('Lifetime oversold but refund failed:', err);
          throw new Error(
            `Lifetime cap reached but automatic refund failed for payment ${paymentId}: ${(err as Error)?.message ?? err}`,
          );
        }
        console.warn(
          `Lifetime cap reached: refunded payment ${paymentId} for user ${userId}`,
        );
        return;
      }

      // Granted. Cancel any prior recurring sub remotely at Dodo so the card
      // stops getting charged after the upgrade. The local cancel is already
      // done by the SQL function; this handles the remote side.
      //
      // If the Dodo API call fails (network blip, rate limit, expired key,
      // Dodo outage), flag the row with `needs_dodo_cancel = true` so a
      // reconciliation pass can pick it up later (see migration 06 +
      // list_pending_dodo_cancels RPC). Without the flag, ops had to read
      // function logs to find orphans — and customers kept getting charged
      // for the plan they thought they replaced.
      if (priorActive?.dodo_subscription_id) {
        try {
          await cancelDodoSubscription(priorActive.dodo_subscription_id);
        } catch (err) {
          console.error(
            `Failed to cancel Dodo sub ${priorActive.dodo_subscription_id} on lifetime upgrade — flagging for reconciliation:`,
            err,
          );
          try {
            await supabase
              .from('subscriptions')
              .update({ needs_dodo_cancel: true })
              .eq('id', priorActive.id);
          } catch (flagErr) {
            // Last-ditch: log loudly. We'd rather have a noisy error than a
            // silent orphan, but at this point ops is going to have to fix
            // it manually anyway.
            console.error(
              `CRITICAL: failed to flag sub ${priorActive.id} for Dodo-cancel reconciliation:`,
              flagErr,
            );
          }
        }
      }

      // Affiliate commission for the lifetime purchase. Idempotent on
      // charge_key (payment_id is guaranteed non-null here — we threw above
      // otherwise). Never throws.
      await bookReferralCommission(supabase, userId, {
        chargeKey:      `pay:${paymentId}`,
        eventType:      'payment.succeeded',
        amountCents:    data.total_amount ?? data.amount ?? null,
        currency:       data.currency ?? 'USD',
        subscriptionId: null,
        paymentId,
      });
      return;
    }

    default:
      // Unhandled but logged in webhook_events for review.
      return;
  }
}

async function upsertActiveSubscription(
  eventType: string,
  data: any,
  userId: string,
  supabase: any,
) {
  const productId   = data.product_id ?? data.product?.product_id;
  const plan        = PLAN_FROM_PRODUCT[productId];
  if (!plan) {
    console.warn(`Unknown product_id ${productId} — skipping`);
    return;
  }

  // Lifetime grants are one-time payments, not subscriptions — they MUST go
  // through `payment.succeeded` → grant_lifetime_subscription RPC, which
  // does the seat-cap check and dedupe atomically. A subscription.* event
  // arriving with a Lifetime product_id is either a Dodo bug, a misrouted
  // event, or an attacker exploiting #5 (resurrect a failed row as Lifetime
  // via a metadata-only update with no amount field). Refuse the path
  // entirely — throwing here lands the event in webhook_events.error_message
  // for ops review, and no row is mutated.
  if (plan === 'lifetime') {
    throw new Error(
      `Refusing Lifetime grant via subscription event ${eventType}: ` +
      `Lifetime must be granted through payment.succeeded only`,
    );
  }

  const periodEnd     = data.next_billing_date ?? data.current_period_end ?? null;
  const subId         = data.subscription_id ?? data.id ?? null;
  const amountCents   = data.recurring_pre_tax_amount ?? data.amount ?? null;
  const currency      = data.currency ?? null;
  const status        = (data.status ?? 'active') as string;
  const cancelAtEnd   = !!data.cancel_at_next_billing_date;

  // Validate the amount/currency against what we expect for this plan
  // *before* writing anything. This is the only check that catches the
  // "subscription.updated event flips the plan to a paid tier without the
  // user paying" class of bug. Throwing here aborts the upsert and the
  // event ends up in webhook_events.error_message.
  // We only validate when there's actually an amount on the event — some
  // subscription.* events (e.g. on a metadata-only update) may legitimately
  // omit it. The "failed → active without amount" gap is closed below.
  if (amountCents != null) {
    assertExpectedAmount(plan, amountCents, currency);
  }

  // If we already track this exact Dodo subscription, update it in place —
  // BUT refuse to resurrect rows that have already reached a terminal state.
  // A stale retry of a "subscription.active" arriving after the user cancelled
  // (or after a Lifetime upgrade replaced the row) must not flip them back.
  // The webhook_events idempotency dedupes same-webhook retries, so the only
  // way we hit this path is a *different* webhook carrying old data.
  if (subId) {
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id, status, current_period_end, amount_cents, currency')
      .eq('dodo_subscription_id', subId)
      .maybeSingle();

    if (existing) {
      // 'failed' is intentionally NOT terminal — PSPs sometimes retry a failed
      // charge successfully, and we must re-activate. BUT a metadata-only
      // `subscription.updated` arriving for a failed sub used to silently
      // re-activate it without amount validation. Tighten the path:
      //   - The inbound event must explicitly represent a charge
      //     (subscription.active or subscription.renewed).
      //   - We must have an amount we can validate. Dodo's payloads are
      //     inconsistent — re-activation events sometimes omit
      //     recurring_pre_tax_amount entirely. Fall back to the amount
      //     already stored on the failed row (we trust it because it was
      //     amount-validated at insert time). Without this fallback, a
      //     legitimate retry-success would leave the user permanently
      //     paywalled.
      const TERMINAL = new Set(['cancelled', 'expired']);
      if (TERMINAL.has(existing.status)) {
        console.warn(
          `Skipping update for sub ${subId}: local row is in terminal state '${existing.status}'`,
        );
        return;
      }
      const reactivatingFailed = existing.status === 'failed';
      const isChargeEvent =
        eventType === 'subscription.active' || eventType === 'subscription.renewed';
      if (reactivatingFailed) {
        if (!isChargeEvent) {
          console.warn(
            `Skipping failed→active for sub ${subId}: non-charge event ${eventType}`,
          );
          return;
        }
        const validateCents    = amountCents ?? existing.amount_cents;
        const validateCurrency = currency ?? existing.currency;
        if (validateCents == null) {
          console.warn(
            `Skipping failed→active for sub ${subId}: no amount on event or stored row`,
          );
          return;
        }
        // Throws if the (event-or-stored) amount doesn't match expected.
        assertExpectedAmount(plan, validateCents, validateCurrency);
      }

      // Build the patch conditionally so a partial event can't NULL out a
      // valid value. Specifically: a subscription.updated whose payload is
      // missing next_billing_date/current_period_end used to overwrite the
      // existing timestamp with null, which then made AuthProvider.isPaid
      // fail closed for the (still-paying) user. Same defensive treatment
      // for amount_cents and currency.
      const update: Record<string, unknown> = {
        status: normalizeStatus(status),
        plan,
        cancel_at_next_billing_date: cancelAtEnd,
      };
      if (periodEnd != null)   update.current_period_end = periodEnd;
      if (amountCents != null) update.amount_cents       = amountCents;
      if (currency != null)    update.currency           = currency;

      await supabase
        .from('subscriptions')
        .update(update)
        .eq('id', existing.id);
      return;
    }
  }

  // New subscription_id we've never seen before — most often a `change-plan`
  // that issued a fresh id. Cancel any prior active row first to keep the
  // unique-active index satisfied, then insert.
  await supabase
    .from('subscriptions')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'active');

  await supabase.from('subscriptions').insert({
    user_id: userId,
    plan,
    status: normalizeStatus(status),
    current_period_end: periodEnd,
    cancel_at_next_billing_date: cancelAtEnd,
    dodo_subscription_id: subId,
    amount_cents: amountCents,
    currency: currency ?? 'USD',
  });
}

async function markSubscriptionInactive(
  eventType: string,
  data: any,
  userId: string,
  supabase: any,
) {
  const newStatus =
    eventType === 'subscription.cancelled' ? 'cancelled' :
    eventType === 'subscription.expired'   ? 'expired'   :
    eventType === 'subscription.failed'    ? 'failed'    : 'on_hold';

  const subId = data.subscription_id ?? data.id ?? null;
  // Build the update conditionally:
  //  - Only stamp cancelled_at when the new state IS cancelled (otherwise
  //    we'd wipe a prior cancellation timestamp on a stale 'failed' retry).
  //  - Reset cancel_at_next_billing_date on every terminal state so the UI
  //    can't show "Pending cancel" on an already-expired/cancelled row.
  const update: Record<string, unknown> = {
    status: newStatus,
    cancel_at_next_billing_date: false,
  };
  if (eventType === 'subscription.cancelled') {
    update.cancelled_at = new Date().toISOString();
  }

  if (subId) {
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('dodo_subscription_id', subId)
      .maybeSingle();
    if (existing) {
      await supabase.from('subscriptions').update(update).eq('id', existing.id);
      return;
    }
    // The event names a subscription_id we've never tracked. This happens
    // when a brand-new subscription fails its very first charge — Dodo emits
    // subscription.failed before (or out of order with) any subscription.*
    // event that would have inserted it. In that case the user's *existing*
    // active row (e.g. their signup-trigger free/active) is unrelated and
    // must NOT be flipped to failed/cancelled — that would lock them out of
    // free tier on a failed paid attempt.
    //
    // Insert a standalone audit row ONLY when the user has no active
    // subscription right now. With an existing active row the standalone
    // insert was confusing the admin dashboard's `latestByUser` lookup
    // (the new failed row's created_at = now() made it the "latest" view
    // of that user, mis-reporting their state). When there's no active
    // row it's safe to insert — there's nothing to overshadow, and the
    // audit trail is genuinely useful.
    const { data: hasActive } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (hasActive) {
      console.warn(
        `Skipping standalone ${eventType} insert for unknown sub ${subId}: ` +
        `user ${userId} already has an active subscription. Event recorded ` +
        `in webhook_events for audit.`,
      );
      return;
    }

    const productId  = data.product_id ?? data.product?.product_id;
    const failedPlan = PLAN_FROM_PRODUCT[productId] ?? 'free';
    await supabase.from('subscriptions').insert({
      user_id: userId,
      plan: failedPlan,
      status: newStatus,
      dodo_subscription_id: subId,
      cancelled_at: eventType === 'subscription.cancelled' ? new Date().toISOString() : null,
    });
    return;
  }
  // No subscription_id at all on the event — fall back to flipping whatever
  // active row exists. (Pre-payment-flow legacy events; rare in practice.)
  await supabase
    .from('subscriptions')
    .update(update)
    .eq('user_id', userId)
    .eq('status', 'active');
}

// Book an affiliate commission for a paid charge, if the buyer was referred.
//
// First-touch attribution: we read profiles.referred_by (stamped at signup by
// record_referral) rather than trusting anything on the event, so a partner
// can only ever be credited for users they genuinely brought in.
//
// Commission = the referrer's flat override when set, otherwise a percentage
// (basis points) of the sale amount. One row per real charge, deduped by
// charge_key so webhook retries / reprocessing can't double-book.
//
// CRITICAL: this never throws. The payment has already been granted by the
// time we get here; a failure in the referral subsystem (missing table on an
// un-migrated project, transient error) must not bubble up and return a 500
// that makes Dodo retry — or worse, leave the buyer's entitlement in limbo.
// Failures are logged and swallowed.
async function bookReferralCommission(
  supabase: any,
  userId: string,
  opts: {
    chargeKey: string;
    eventType: string;
    amountCents: number | null;
    currency: string | null;
    subscriptionId: string | null;
    paymentId: string | null;
  },
): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('referred_by')
      .eq('id', userId)
      .maybeSingle();

    const referrerId = profile?.referred_by ?? null;
    if (!referrerId) return; // organic signup — nothing to pay

    const { data: ref } = await supabase
      .from('referrers')
      .select('id, active, commission_rate_bps, commission_flat_cents')
      .eq('id', referrerId)
      .maybeSingle();
    if (!ref || ref.active !== true) return; // unknown / disabled partner

    const amount = typeof opts.amountCents === 'number'
      ? opts.amountCents
      : Number(opts.amountCents);

    let commission = 0;
    if (ref.commission_flat_cents != null) {
      commission = ref.commission_flat_cents;
    } else if (Number.isFinite(amount)) {
      commission = Math.floor((amount * (ref.commission_rate_bps ?? 0)) / 10000);
    }
    if (!Number.isFinite(commission) || commission <= 0) return;

    // upsert with ignoreDuplicates so a re-processed event for the same charge
    // is a silent no-op instead of a unique-violation error.
    const { error } = await supabase
      .from('referral_commissions')
      .upsert(
        {
          referrer_id:          ref.id,
          user_id:              userId,
          charge_key:           opts.chargeKey,
          event_type:           opts.eventType,
          sale_amount_cents:    Number.isFinite(amount) ? amount : null,
          currency:             opts.currency ?? null,
          commission_cents:     commission,
          status:               'pending',
          dodo_payment_id:      opts.paymentId ?? null,
          dodo_subscription_id: opts.subscriptionId ?? null,
        },
        { onConflict: 'charge_key', ignoreDuplicates: true },
      );
    if (error) {
      console.error('bookReferralCommission upsert failed (non-fatal):', error);
    }
  } catch (err) {
    console.error('bookReferralCommission threw (non-fatal):', err);
  }
}

// Refund a one-time payment at Dodo via the official SDK. Used when the
// lifetime seat-cap was exceeded and we're rolling the customer's purchase
// back rather than silently keeping the money.
async function refundDodoPayment(paymentId: string): Promise<void> {
  const client = dodoClient();
  await client.refunds.create({
    payment_id: paymentId,
    reason: 'Lifetime seat cap reached — automatic refund',
  });
}

// Cancel a subscription at Dodo via the official SDK. The same shape that
// subscription-action uses for its 'cancel-now' branch — keeping the calls
// in lockstep so future Dodo API changes break in only one place.
async function cancelDodoSubscription(subscriptionId: string): Promise<void> {
  const client = dodoClient();
  await client.subscriptions.update(subscriptionId, { status: 'cancelled' });
}

// Map Dodo's status strings to our enum values.
function normalizeStatus(s: string): string {
  switch (s) {
    case 'active':    return 'active';
    case 'on_hold':   return 'on_hold';
    case 'cancelled': return 'cancelled';
    case 'expired':   return 'expired';
    case 'failed':    return 'failed';
    default:          return 'active';
  }
}
