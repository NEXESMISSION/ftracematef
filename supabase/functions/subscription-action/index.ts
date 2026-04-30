// Supabase Edge Function: subscription-action
// ─────────────────────────────────────────────────────────────────────────────
// Single endpoint that performs subscription management actions on behalf of
// the authenticated user. Verifies the user OWNS the target subscription
// before calling Dodo Payments — so a user can never act on someone else's
// subscription even if they spoofed the id.
//
// Body shape:
//   { action: 'cancel-at-period-end' }   → patch cancel_at_next_billing_date=true
//   { action: 'undo-cancel' }            → patch cancel_at_next_billing_date=false
//   { action: 'change-plan', plan: 'monthly'|'quarterly' }
//                                        → subscriptions.changePlan with proration
//
// Note: there is intentionally no 'cancel-now' here. Immediate cancellation
// without a refund prompt is a support-ticket factory; users go through
// 'cancel-at-period-end' instead. If we ever need it, expose it with proper
// confirmation copy in the UI.
//
// Required Edge Function secrets:
//   DODO_API_KEY, DODO_ENVIRONMENT,
//   DODO_PRODUCT_MONTHLY, DODO_PRODUCT_QUARTERLY  (for change-plan)
// ─────────────────────────────────────────────────────────────────────────────

import DodoPayments from 'npm:dodopayments@1';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';

const PLAN_TO_PRODUCT_ENV: Record<string, string> = {
  monthly:   'DODO_PRODUCT_MONTHLY',
  quarterly: 'DODO_PRODUCT_QUARTERLY',
};

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  // 1. Auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'Not authenticated' }, 401);
  const user = userData.user;

  // Rate limit: 10 actions per 60 seconds per user. The cancel/undo-cancel
  // pair makes a tight loop trivial without this — protects Dodo's API
  // quota and our own function invocation budget.
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    bucket_key:     `sub-action:${user.id}`,
    max_count:      10,
    window_seconds: 60,
  });
  if (allowed === false) {
    return json({ error: 'Too many requests. Slow down and try again in a minute.' }, 429);
  }

  // 2. Look up the user's active subscription (RLS already restricts to self)
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, plan, status, dodo_subscription_id, dodo_payment_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (!sub) return json({ error: 'No active subscription' }, 404);

  // Lifetime tier is a one-time purchase — nothing to cancel/change in Dodo.
  if (sub.plan === 'lifetime') {
    return json({ error: 'Lifetime plans cannot be cancelled or changed.' }, 409);
  }

  // 3. Parse body
  let body: { action?: string; plan?: string } = {};
  try { body = await req.json(); } catch { /* ignored */ }

  // ── Dev-test mock branch ──────────────────────────────────────────────
  // A subscription with no `dodo_subscription_id` (or one beginning with
  // `dev_`) was fabricated by dev-mutate-subscription, not paid for at
  // Dodo. Calling Dodo's API on it would 404. In a non-live project we
  // mutate the local row directly via service role so admins can exercise
  // the full UI flow without real payments. In live_mode we fall through
  // and return the same 409 the previous code returned — that's the only
  // legit way to hit this branch in production (the ~1s race between
  // checkout return and the webhook landing).
  const subId = sub.dodo_subscription_id;
  const isDevTest = !subId || subId.startsWith('dev_');
  const isLive    = Deno.env.get('DODO_ENVIRONMENT') === 'live_mode';

  if (isDevTest && isLive) {
    return json({ error: 'Subscription not linked to a Dodo subscription_id yet — try again in a moment.' }, 409);
  }

  if (isDevTest) {
    // Service role bypasses RLS so we can write to subscriptions directly.
    // Scope every update to `id = sub.id` (already verified to belong to
    // the caller above) so this branch can't touch any other row.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    switch (body.action) {
      case 'cancel-at-period-end': {
        const { error } = await admin
          .from('subscriptions')
          .update({ cancel_at_next_billing_date: true })
          .eq('id', sub.id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, mock: true });
      }

      case 'undo-cancel': {
        const { error } = await admin
          .from('subscriptions')
          .update({ cancel_at_next_billing_date: false, cancelled_at: null })
          .eq('id', sub.id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, mock: true });
      }

      case 'change-plan': {
        const targetPlan = body.plan;
        if (!targetPlan || !PLAN_TO_PRODUCT_ENV[targetPlan]) {
          return json({ error: 'Invalid target plan' }, 400);
        }
        if (targetPlan === sub.plan) {
          return json({ error: 'Already on this plan' }, 409);
        }
        // Skip the 2/day change-plan rate limit on the mock branch — admins
        // testing the flow want to flip back and forth, and no real money
        // moves so the rounding-artefact concern doesn't apply.
        const { error } = await admin
          .from('subscriptions')
          .update({ plan: targetPlan })
          .eq('id', sub.id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, mock: true });
      }

      default:
        return json({ error: 'Unknown action' }, 400);
    }
  }

  // ── Production path: real Dodo SDK ────────────────────────────────────
  const apiKey = Deno.env.get('DODO_API_KEY');
  if (!apiKey) return json({ error: 'Server misconfigured: DODO_API_KEY missing' }, 500);

  const client = new DodoPayments({
    bearerToken: apiKey,
    environment: (Deno.env.get('DODO_ENVIRONMENT') ?? 'test_mode') as
      | 'test_mode'
      | 'live_mode',
  });

  try {
    switch (body.action) {
      case 'cancel-at-period-end': {
        const updated = await client.subscriptions.update(subId!, {
          cancel_at_next_billing_date: true,
        });
        return json({ ok: true, subscription: updated });
      }

      case 'undo-cancel': {
        const updated = await client.subscriptions.update(subId!, {
          cancel_at_next_billing_date: false,
        });
        return json({ ok: true, subscription: updated });
      }

      case 'change-plan': {
        const targetPlan = body.plan;
        if (!targetPlan || !PLAN_TO_PRODUCT_ENV[targetPlan]) {
          return json({ error: 'Invalid target plan' }, 400);
        }
        if (targetPlan === sub.plan) {
          return json({ error: 'Already on this plan' }, 409);
        }
        const newProductId = Deno.env.get(PLAN_TO_PRODUCT_ENV[targetPlan]);
        if (!newProductId) return json({ error: 'Server misconfigured: missing product env var' }, 500);

        // Tighter rate limit specifically for change-plan: each call creates a
        // real prorated charge/credit at Dodo. Allowing the generic 10/min cap
        // would let a user toggle monthly↔quarterly dozens of times a day and
        // accumulate small rounding artefacts on every flip. Cap at 2/day.
        const { data: planAllowed } = await supabase.rpc('check_rate_limit', {
          bucket_key:     `sub-change-plan:${user.id}`,
          max_count:      2,
          window_seconds: 86_400,
        });
        if (planAllowed === false) {
          return json({ error: 'You can only change plans a couple of times per day. Try again tomorrow, or contact support.' }, 429);
        }

        // changePlan returns 202-style result with status/invoice_id/payment_id
        const result = await client.subscriptions.changePlan(subId!, {
          product_id: newProductId,
          quantity: 1,
          proration_billing_mode: 'prorated_immediately',
          on_payment_failure: 'prevent_change',
        });
        return json({ ok: true, result });
      }

      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (err) {
    // Log the raw error server-side; return a friendly, sanitized message
    // so internal Dodo identifiers don't end up in the user-facing UI.
    console.error('Dodo subscription action failed:', err);
    return json({ error: 'Could not update your subscription. Please try again, or contact support if it persists.' }, 502);
  }
});
