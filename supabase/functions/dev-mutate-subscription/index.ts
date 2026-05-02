// Supabase Edge Function: dev-mutate-subscription
// ─────────────────────────────────────────────────────────────────────────────
// Lets an admin flip their own subscription row to any state, for end-to-end
// testing of the paywall + renewal + failure flows without involving Dodo.
//
// SECURITY: defense-in-depth.
//   1. DODO_ENVIRONMENT must NOT be "live_mode". This is a hard fence: even
//      if a future operator accidentally sets ENABLE_DEV_MUTATE=true on the
//      live project, the function still refuses to run while production
//      payments are live. The two flags must disagree to enable mutation.
//   2. ENABLE_DEV_MUTATE must be exactly "true". Default-deny in prod: a
//      compromised admin Google account is useless against a function that
//      isn't enabled. Set this only in test/staging projects.
//   3. ADMIN_EMAILS allowlist (comma-separated) gates callers further.
//   4. Lifetime grants here re-check the seat cap so this back-door can't
//      push the count past the advertised limit.
//
// Required Edge Function secrets:
//   DODO_ENVIRONMENT          — set to "live_mode" in prod to disable this fn
//   ENABLE_DEV_MUTATE         — must equal "true" or every call returns 403
//   ADMIN_EMAILS              — comma-separated allowlist of admin emails
// (SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY auto-provided)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';
import { isAdminEmail } from '../_shared/admin.ts';

type Plan   = 'free' | 'monthly' | 'quarterly' | 'lifetime';
type Status = 'active' | 'on_hold' | 'cancelled' | 'expired' | 'failed';

const VALID_PLANS:    Plan[]   = ['free', 'monthly', 'quarterly', 'lifetime'];
const VALID_STATUSES: Status[] = ['active', 'on_hold', 'cancelled', 'expired', 'failed'];

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  // Hard fence #1: refuse to run when Dodo is in live_mode. This is the
  // safety belt against a single misconfigured ENABLE_DEV_MUTATE flag on
  // the production project — even if that flag is true, the function will
  // not flip subscription state while real money is moving through Dodo.
  // The only way to enable this function is to BOTH set ENABLE_DEV_MUTATE
  // and run Dodo in test_mode; production setups can never satisfy both.
  if (Deno.env.get('DODO_ENVIRONMENT') === 'live_mode') {
    return json({ error: 'Dev mutate refused in live_mode' }, 403);
  }

  // Hard fence #2: if the function is shipped to a project where ENABLE_DEV_MUTATE
  // isn't set to "true", every request 403s before it even reaches auth. Keep
  // this off in production projects — leaving it on lets any admin email
  // fabricate paid state without paying Dodo.
  if (Deno.env.get('ENABLE_DEV_MUTATE') !== 'true') {
    return json({ error: 'Dev mutate disabled' }, 403);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'Not authenticated' }, 401);
  const user = userData.user;
  if (!isAdminEmail(user.email)) return json({ error: 'Not authorized' }, 403);

  // Parse + validate the partial update.
  let body: {
    plan?: Plan;
    status?: Status;
    period_end_offset_days?: number;        // shorthand: now + N days
    current_period_end?: string | null;     // explicit ISO timestamp (or null)
    reset_free_trial?: boolean;             // null out profiles.free_trial_started_at
  } = {};
  try { body = await req.json(); } catch { /* ignored */ }

  const update: Record<string, unknown> = {};

  if (body.plan !== undefined) {
    if (!VALID_PLANS.includes(body.plan)) return json({ error: 'Invalid plan' }, 400);
    update.plan = body.plan;
  }
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) return json({ error: 'Invalid status' }, 400);
    update.status = body.status;
  }
  if (body.current_period_end !== undefined) {
    update.current_period_end = body.current_period_end;
  } else if (typeof body.period_end_offset_days === 'number' && Number.isFinite(body.period_end_offset_days)) {
    const ms = body.period_end_offset_days * 24 * 60 * 60 * 1000;
    update.current_period_end = new Date(Date.now() + ms).toISOString();
  }

  // Reset state for "back to free" — clear any leftover Dodo IDs so the next
  // real checkout looks like a clean slate.
  if (body.plan === 'free') {
    update.current_period_end = null;
    update.cancel_at_next_billing_date = false;
    update.cancelled_at = null;
    update.dodo_subscription_id = null;
    update.dodo_payment_id = null;
  }

  // Reactivating from a previously-cancelled state? Clear the stale
  // cancelled_at so the Account UI doesn't keep saying "Pending cancel".
  // This makes the "Simulate renewal" preset behave intuitively.
  if (body.status === 'active') {
    update.cancelled_at = null;
    if (update.cancel_at_next_billing_date === undefined) {
      update.cancel_at_next_billing_date = false;
    }
  }

  if (Object.keys(update).length === 0 && !body.reset_free_trial) {
    return json({ error: 'No fields to update' }, 400);
  }

  // Service-role client to bypass RLS (the table only allows writes via service).
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Profile-level mutation: reset the free-trial stamp AND zero the session
  // counter. Admin-only convenience for testing the post-trial paywall flow
  // without spinning up a fresh account. Allowed in combination with
  // subscription mutations (e.g. "Reset to free + restore trial") or as a
  // standalone call.
  if (body.reset_free_trial) {
    const { error: trialErr } = await admin
      .from('profiles')
      .update({ free_trial_started_at: null, free_sessions_used: 0 })
      .eq('id', user.id);
    if (trialErr) return json({ error: `reset_free_trial failed: ${trialErr.message}` }, 500);

    // Standalone call — nothing else to do.
    if (Object.keys(update).length === 0) {
      return json({ free_trial_reset: true });
    }
  }

  // Honor the advertised lifetime cap even on this admin-only path. Without
  // this, an admin granting themselves an active lifetime row could push the
  // public seat count above the cap and falsify the "limited 10" claim.
  const grantingActiveLifetime =
    body.plan === 'lifetime' &&
    (body.status === 'active' || body.status === undefined);
  if (grantingActiveLifetime) {
    const { data: seatsRow, error: seatsErr } = await admin.rpc('lifetime_seats_left');
    if (seatsErr) return json({ error: `lifetime_seats_left failed: ${seatsErr.message}` }, 500);
    const seatsLeft = typeof seatsRow === 'number' ? seatsRow : seatsRow?.[0] ?? 0;
    if (seatsLeft <= 0) return json({ error: 'Lifetime cap reached' }, 409);
  }

  // Mutation is scoped to the caller's own user_id — admins can't edit
  // other users' rows through this endpoint.
  // The unique-active partial index means we may need to deactivate any
  // existing active row before flipping a different row to active. The
  // simplest correct approach: update the latest row (one per user via the
  // signup trigger), or upsert if missing.
  const { data: existing } = await admin
    .from('subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing) {
    // Shouldn't happen — handle_new_user trigger creates a row on signup —
    // but be defensive.
    const { data: inserted, error: insErr } = await admin
      .from('subscriptions')
      .insert({ user_id: user.id, plan: 'free', status: 'active', ...update })
      .select('*')
      .single();
    if (insErr) return json({ error: insErr.message }, 500);
    return json({ subscription: inserted });
  }

  const { data: updated, error } = await admin
    .from('subscriptions')
    .update(update)
    .eq('id', existing.id)
    .select('*')
    .single();
  if (error) return json({ error: error.message }, 500);

  return json({ subscription: updated });
});
