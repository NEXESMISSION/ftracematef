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
//   DODO_PRICE_MONTHLY_CENTS  — expected price in cents for amount validation
//   DODO_PRICE_QUARTERLY_CENTS
//   DODO_PRICE_LIFETIME_CENTS
//   DODO_EXPECTED_CURRENCY    — uppercased ISO 4217 (default "USD")
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

// Plan → expected amount in cents for amount/currency validation. Reading
// from env keeps the webhook authoritative on what each plan should cost,
// independent of whatever a stray event claims. When set, an event whose
// amount disagrees is rejected and the user's plan stays put — so a tampered
// or replayed event carrying the wrong product_id can't silently upgrade.
//
// Env var is *optional* per-plan: unset → log a warning and skip the check
// (existing deployments don't break the moment they pull this code), set
// → strict. Operators should set all three on first deploy of this code.
const EXPECTED_AMOUNT_CENTS: Record<string, number | null> = {
  monthly:   parseEnvInt('DODO_PRICE_MONTHLY_CENTS'),
  quarterly: parseEnvInt('DODO_PRICE_QUARTERLY_CENTS'),
  lifetime:  parseEnvInt('DODO_PRICE_LIFETIME_CENTS'),
};
const EXPECTED_CURRENCY = (Deno.env.get('DODO_EXPECTED_CURRENCY') ?? 'USD').toUpperCase();

function parseEnvInt(name: string): number | null {
  const raw = Deno.env.get(name);
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Throws if `amount` / `currency` don't match what we expect for `plan`.
// Pre-tax amounts can be slightly less than the headline price in regions
// that add tax on top, so we treat the env value as a *minimum*.
function assertExpectedAmount(plan: string, amountCents: unknown, currency: unknown) {
  const expectedCents = EXPECTED_AMOUNT_CENTS[plan];
  if (expectedCents == null) {
    console.warn(`[webhook] No DODO_PRICE_${plan.toUpperCase()}_CENTS set — amount validation skipped`);
  } else {
    const got = typeof amountCents === 'number' ? amountCents : Number(amountCents);
    if (!Number.isFinite(got) || got < expectedCents) {
      throw new Error(
        `Amount validation failed for plan ${plan}: got ${amountCents}, expected >= ${expectedCents}`,
      );
    }
  }
  if (currency != null) {
    const got = String(currency).toUpperCase();
    if (got !== EXPECTED_CURRENCY) {
      throw new Error(
        `Currency validation failed for plan ${plan}: got ${got}, expected ${EXPECTED_CURRENCY}`,
      );
    }
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
    await processEvent(event, supabase);
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

async function processEvent(event: any, supabase: any) {
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
