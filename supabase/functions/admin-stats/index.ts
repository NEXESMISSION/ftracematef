// Supabase Edge Function: admin-stats
// ─────────────────────────────────────────────────────────────────────────────
// Server-side analytics rollup for the /admin-me dashboard's StatsPanel.
// Calls the security-definer get_admin_stats() RPC which aggregates funnel,
// revenue, activity, engagement, top users, and at-risk users in a single
// pass. The bulk of the work happens in the database; this function only
// does the auth gate.
//
// SECURITY: same defense-in-depth as admin-list-users.
//   1. Authorization header must verify against Supabase auth.
//   2. The caller's email must be on the ADMIN_EMAILS allowlist.
//   3. The caller's profiles.is_admin must be true.
//   4. Rate-limited to 30 calls/min per admin (the rollup query is heavier
//      than the list-users read; tighter cap leaves headroom).
//
// Required Edge Function secrets:
//   ADMIN_EMAILS — comma-separated allowlist (case-insensitive)
//   (SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY auto-provided)
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
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization' }, 401);

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'Not authenticated' }, 401);
  const user = userData.user;

  // Gate #1: env-var allowlist.
  if (!isAdminEmail(user.email)) return json({ error: 'Not authorized' }, 403);

  // Service-role client — get_admin_stats reads across all profiles +
  // subscriptions + trace_session_runs, which RLS would otherwise block.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Gate #2: profiles.is_admin on the caller. Cross-checked with the env
  // var so neither alone unlocks the endpoint.
  const { data: callerProfile, error: callerErr } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (callerErr) return json({ error: 'Profile lookup failed' }, 500);
  if (!callerProfile?.is_admin) return json({ error: 'Not authorized' }, 403);

  // Rate-limit per admin. Tighter than admin-list-users because the rollup
  // touches every row in profiles + subscriptions + trace_session_runs.
  const { data: allowed } = await supabaseAuth.rpc('check_rate_limit', {
    bucket_key:     `admin-stats:${user.id}`,
    max_count:      30,
    window_seconds: 60,
  });
  if (allowed === false) {
    return json({ error: 'Too many requests. Slow down and try again in a minute.' }, 429);
  }

  // The RPCs return a single jsonb blob each. service_role bypasses RLS
  // and is the only role granted execute, so non-admin routes can't call
  // these even with a leaked SUPABASE_URL. Run in parallel — both touch
  // different tables, no ordering hazard.
  const [statsRes, healthRes] = await Promise.all([
    admin.rpc('get_admin_stats'),
    admin.rpc('get_webhook_health'),
  ]);

  if (statsRes.error) {
    console.error('[admin-stats] get_admin_stats failed:', statsRes.error);
    return json({ error: statsRes.error.message }, 500);
  }
  // Webhook health is a soft dependency — log and degrade gracefully so an
  // older project that hasn't run the migration yet still gets the rest of
  // the stats payload.
  if (healthRes.error) {
    console.warn('[admin-stats] get_webhook_health failed (continuing):', healthRes.error);
  }

  return json({
    stats:          statsRes.data,
    webhook_health: healthRes.data ?? null,
  });
});
