// Supabase Edge Function: dev-mutate-subscription
// ─────────────────────────────────────────────────────────────────────────────
// Lets an admin flip their own subscription row to any state, for end-to-end
// testing of the paywall + renewal + failure flows without involving Dodo.
//
// SECURITY: gated by ADMIN_EMAILS (comma-separated). Only emails in that list
// can call this. The mutation is always scoped to the caller's own user_id —
// no admin can edit another user's row through this function.
//
// Required Edge Function secrets:
//   ADMIN_EMAILS              — comma-separated allowlist of admin emails
// (SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY auto-provided)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { isAdminEmail } from '../_shared/admin.ts';

type Plan   = 'free' | 'monthly' | 'quarterly' | 'lifetime';
type Status = 'active' | 'on_hold' | 'cancelled' | 'expired' | 'failed';

const VALID_PLANS:    Plan[]   = ['free', 'monthly', 'quarterly', 'lifetime'];
const VALID_STATUSES: Status[] = ['active', 'on_hold', 'cancelled', 'expired', 'failed'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return json({ error: 'Not authenticated' }, 401);
  if (!isAdminEmail(user.email)) return json({ error: 'Not authorized' }, 403);

  // Parse + validate the partial update.
  let body: {
    plan?: Plan;
    status?: Status;
    period_end_offset_days?: number;        // shorthand: now + N days
    current_period_end?: string | null;     // explicit ISO timestamp (or null)
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

  if (Object.keys(update).length === 0) {
    return json({ error: 'No fields to update' }, 400);
  }

  // Service-role client to bypass RLS (the table only allows writes via service).
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

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

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
