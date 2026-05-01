// Supabase Edge Function: admin-user-activity
// ─────────────────────────────────────────────────────────────────────────────
// Per-user log sheet for the /admin-me dashboard. POST { user_id } returns
// every breadcrumb we have on that user, ordered newest-first:
//
//   - sub_history : every row in public.subscriptions for the user
//                   (so plan upgrades / cancels / renewals are visible)
//   - events      : public.webhook_events that mention the user's
//                   dodo_customer_id (payment + subscription lifecycle)
//   - sign_ins    : auth.audit_log_entries for the user (every login,
//                   token refresh, password change, etc.)
//
// SECURITY: same double-gate as admin-list-users (ADMIN_EMAILS env +
// profiles.is_admin). Service role only ever queries on the explicit
// user_id from the request body — admins can't fish other users' rows
// without going through this gate first.
//
// Required Edge Function secrets:
//   ADMIN_EMAILS — comma-separated allowlist (case-insensitive)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';
import { isAdminEmail } from '../_shared/admin.ts';

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization' }, 401);

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'Not authenticated' }, 401);
  const caller = userData.user;

  if (!isAdminEmail(caller.email)) return json({ error: 'Not authorized' }, 403);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: callerProfile, error: callerErr } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', caller.id)
    .maybeSingle();
  if (callerErr) return json({ error: 'Profile lookup failed' }, 500);
  if (!callerProfile?.is_admin) return json({ error: 'Not authorized' }, 403);

  const { data: allowed } = await supabaseAuth.rpc('check_rate_limit', {
    bucket_key:     `admin-user-activity:${caller.id}`,
    max_count:      120,
    window_seconds: 60,
  });
  if (allowed === false) {
    return json({ error: 'Too many requests. Slow down and try again in a minute.' }, 429);
  }

  let body: { user_id?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const userId = body.user_id;
  if (!userId || typeof userId !== 'string') {
    return json({ error: 'user_id is required' }, 400);
  }

  // Resolve the target's dodo_customer_id so we can scope webhook_events.
  // Free users will have no customer_id and therefore no events — that's the
  // correct empty case, not an error.
  const { data: targetProfile, error: targetErr } = await admin
    .from('profiles')
    .select('id, email, display_name, dodo_customer_id, last_seen_at')
    .eq('id', userId)
    .maybeSingle();
  if (targetErr) return json({ error: targetErr.message }, 500);
  if (!targetProfile)   return json({ error: 'User not found' }, 404);

  const customerId = targetProfile.dodo_customer_id;

  const [subHistRes, eventsRes] = await Promise.all([
    admin
      .from('subscriptions')
      .select('id, plan, status, current_period_end, cancel_at_next_billing_date, amount_cents, currency, dodo_subscription_id, dodo_payment_id, created_at, updated_at, cancelled_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
    customerId
      ? admin
          .from('webhook_events')
          .select('id, webhook_id, event_type, processed, error_message, created_at, processed_at, payload')
          // Cast jsonb path to text for an equality compare on customer_id.
          // Match either of the two shapes Dodo uses across event types.
          .or(`payload->data->customer->>customer_id.eq.${customerId},payload->data->>customer_id.eq.${customerId}`)
          .order('created_at', { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (subHistRes.error) return json({ error: subHistRes.error.message }, 500);
  if (eventsRes.error)  return json({ error: eventsRes.error.message }, 500);

  // Auth audit log: every sign-in / token refresh / sign-out attempt for the
  // target user. Stored in the auth schema; service-role can read it via the
  // PostgREST `schema()` selector.
  let signIns: Array<{ id: string; action: string; created_at: string; ip_address: string | null }> = [];
  try {
    const { data: auditRows, error: auditErr } = await admin
      .schema('auth')
      .from('audit_log_entries')
      // payload->>'actor_id' is the user UUID for actor-driven events.
      .select('id, payload, created_at, ip_address')
      .filter('payload->>actor_id', 'eq', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (auditErr) {
      console.warn('[admin-user-activity] audit_log_entries query failed:', auditErr);
    } else {
      signIns = (auditRows ?? []).map((r: any) => ({
        id:         r.id,
        action:     (r.payload?.action as string) ?? 'unknown',
        created_at: r.created_at,
        ip_address: r.ip_address ?? null,
      }));
    }
  } catch (err) {
    // Some hosted Supabase tiers restrict schema('auth') reads — fall back
    // to an empty list rather than failing the whole activity payload.
    console.warn('[admin-user-activity] auth schema read threw:', err);
  }

  // Trim webhook payloads to the bits the UI actually shows, so we don't ship
  // raw card metadata across the wire. Full payload stays in the DB.
  const events = (eventsRes.data ?? []).map((e: any) => {
    const d = e.payload?.data ?? {};
    return {
      id:            e.id,
      event_type:    e.event_type,
      created_at:    e.created_at,
      processed:     !!e.processed,
      error_message: e.error_message,
      // Lightweight summary fields — all optional, all string-ish.
      subscription_id: d.subscription_id ?? null,
      payment_id:      d.payment_id ?? null,
      amount:          d.total_amount ?? d.amount ?? null,
      currency:        d.currency ?? null,
      status:          d.status ?? null,
    };
  });

  return json({
    user: {
      id:           targetProfile.id,
      email:        targetProfile.email,
      display_name: targetProfile.display_name,
    },
    sub_history: subHistRes.data ?? [],
    events,
    sign_ins:    signIns,
  });
});
