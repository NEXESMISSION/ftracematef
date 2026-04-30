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
    // Row exists but not yet processed → another worker is in flight or it
    // failed previously. Tell Dodo to retry; only one of us will own the
    // claim once the prior in-flight finishes (success or marks attempts).
    return new Response('In-flight, retry later', { status: 409 });
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
    console.warn(`No supabase_user_id in metadata for event ${type} — skipping`);
    return;
  }

  // Save the Dodo customer id on the profile (first time we see one)
  const customerId = data.customer?.customer_id ?? data.customer_id;
  if (customerId) {
    await supabase
      .from('profiles')
      .update({ dodo_customer_id: customerId })
      .eq('id', userId)
      .is('dodo_customer_id', null);
  }

  switch (type) {
    case 'subscription.active':
    case 'subscription.renewed':
    case 'subscription.plan_changed':
    case 'subscription.updated': {
      await upsertActiveSubscription(data, userId, supabase);
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

      // Idempotency: don't insert twice for the same payment.
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('dodo_payment_id', paymentId)
        .maybeSingle();
      if (existing) return;

      // Re-check the lifetime cap at commit-time, not at checkout-time. The
      // checkout guard in create-checkout is best-effort — many users can pass
      // it concurrently with seatsLeft > 0. Here is the only place we hold the
      // serializable view of "active lifetime rows" before inserting.
      const { data: seatsRow } = await supabase.rpc('lifetime_seats_left');
      const seatsLeft = typeof seatsRow === 'number' ? seatsRow : seatsRow?.[0] ?? 0;
      if (seatsLeft <= 0) {
        // Refund + cancel at Dodo so the customer isn't charged for nothing.
        try {
          if (paymentId) await refundDodoPayment(paymentId);
        } catch (err) {
          console.error('Lifetime oversold but refund failed:', err);
        }
        throw new Error(
          `Lifetime cap reached: refunded payment ${paymentId} for user ${userId}`,
        );
      }

      // Find any active recurring sub the user has at Dodo. We need to cancel
      // it remotely so the customer's card stops getting charged after they
      // upgrade to Lifetime — otherwise it's a refund/chargeback magnet.
      const { data: priorActive } = await supabase
        .from('subscriptions')
        .select('id, dodo_subscription_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .not('dodo_subscription_id', 'is', null)
        .maybeSingle();

      if (priorActive?.dodo_subscription_id) {
        try {
          await cancelDodoSubscription(priorActive.dodo_subscription_id);
        } catch (err) {
          // Log but don't fail the webhook — the local cancel below still runs,
          // and operations can clean up the Dodo side from the audit log.
          console.error(
            `Failed to cancel Dodo sub ${priorActive.dodo_subscription_id} on lifetime upgrade:`,
            err,
          );
        }
      }

      // Cancel any active row locally, then insert lifetime row.
      await supabase
        .from('subscriptions')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('status', 'active');

      await supabase.from('subscriptions').insert({
        user_id: userId,
        plan: 'lifetime',
        status: 'active',
        current_period_end: null,
        dodo_payment_id: paymentId,
        amount_cents: data.total_amount ?? data.amount ?? null,
        currency: data.currency ?? 'USD',
      });
      return;
    }

    default:
      // Unhandled but logged in webhook_events for review.
      return;
  }
}

async function upsertActiveSubscription(data: any, userId: string, supabase: any) {
  const productId   = data.product_id ?? data.product?.product_id;
  const plan        = PLAN_FROM_PRODUCT[productId];
  if (!plan) {
    console.warn(`Unknown product_id ${productId} — skipping`);
    return;
  }
  const periodEnd     = data.next_billing_date ?? data.current_period_end ?? null;
  const subId         = data.subscription_id ?? data.id ?? null;
  const amountCents   = data.recurring_pre_tax_amount ?? data.amount ?? null;
  const currency      = data.currency ?? 'USD';
  const status        = (data.status ?? 'active') as string;
  const cancelAtEnd   = !!data.cancel_at_next_billing_date;

  // If we already track this exact Dodo subscription, update it in place —
  // BUT refuse to resurrect rows that have already reached a terminal state.
  // A stale retry of a "subscription.active" arriving after the user cancelled
  // (or after a Lifetime upgrade replaced the row) must not flip them back.
  // C3's idempotency dedupes same-webhook retries, so the only way we hit
  // this path is a *different* webhook carrying old data.
  if (subId) {
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id, status')
      .eq('dodo_subscription_id', subId)
      .maybeSingle();

    if (existing) {
      const TERMINAL = new Set(['cancelled', 'expired', 'failed']);
      if (TERMINAL.has(existing.status)) {
        console.warn(
          `Skipping update for sub ${subId}: local row is in terminal state '${existing.status}'`,
        );
        return;
      }
      await supabase
        .from('subscriptions')
        .update({
          status: normalizeStatus(status),
          plan,
          current_period_end: periodEnd,
          cancel_at_next_billing_date: cancelAtEnd,
          amount_cents: amountCents,
          currency,
        })
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
    currency,
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
  const update = {
    status: newStatus,
    cancelled_at: eventType === 'subscription.cancelled' ? new Date().toISOString() : null,
  };

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
  }
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
