// Supabase Edge Function: admin-analytics
// ─────────────────────────────────────────────────────────────────────────────
// Powers the /admin-me "Pulse" tab. Returns the full analytics overview
// (totals, geo for the globe, source/device/os/browser/page breakdowns, daily
// timeseries, acquisition funnel) for a date range, and — when a `path` is
// supplied — the per-page heatmap payload (click points, scroll funnel, rage
// hotspots, most-clicked elements).
//
// SECURITY: identical triple-gate to admin-stats —
//   1. Authorization header must verify against Supabase auth.
//   2. The caller's email must be on the ADMIN_EMAILS allowlist.
//   3. The caller's profiles.is_admin must be true.
//   4. Rate-limited per admin (the rollup scans the events firehose).
//
// Required Edge Function secrets:
//   ADMIN_EMAILS — comma-separated allowlist (case-insensitive)
//   (SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY auto-provided)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';
import { isAdminEmail } from '../_shared/admin.ts';

const RANGE_DAYS: Record<string, number> = {
  '24h': 1, '7d': 7, '30d': 30, '90d': 90, 'all': 3650,
};

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

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

  if (!isAdminEmail(user.email)) return json({ error: 'Not authorized' }, 403);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: callerProfile, error: callerErr } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (callerErr) return json({ error: 'Profile lookup failed' }, 500);
  if (!callerProfile?.is_admin) return json({ error: 'Not authorized' }, 403);

  const { data: allowed } = await supabaseAuth.rpc('check_rate_limit', {
    bucket_key: `admin-analytics:${user.id}`, max_count: 60, window_seconds: 60,
  });
  if (allowed === false) {
    return json({ error: 'Too many requests. Slow down and try again in a minute.' }, 429);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body → defaults */ }

  const rangeKey = typeof body.range === 'string' && body.range in RANGE_DAYS
    ? body.range as string : '7d';
  const days = RANGE_DAYS[rangeKey];
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  // Heatmap is opt-in per request: only fetched when the operator has drilled
  // into a specific page, so the default overview call stays light.
  const heatmapPath = typeof body.path === 'string' && body.path
    ? body.path.slice(0, 120) : null;

  const tasks: Promise<unknown>[] = [
    admin.rpc('get_analytics_overview', {
      p_from: from.toISOString(), p_to: to.toISOString(),
    }),
  ];
  if (heatmapPath) {
    tasks.push(admin.rpc('get_heatmap', {
      p_path: heatmapPath, p_from: from.toISOString(), p_to: to.toISOString(),
    }));
  }

  const [overviewRes, heatmapRes] = await Promise.all(tasks) as Array<{ data: unknown; error: { message: string } | null }>;

  if (overviewRes.error) {
    console.error('[admin-analytics] get_analytics_overview failed:', overviewRes.error);
    return json({ error: overviewRes.error.message }, 500);
  }
  if (heatmapRes?.error) {
    console.warn('[admin-analytics] get_heatmap failed (continuing):', heatmapRes.error);
  }

  return json({
    range: rangeKey,
    overview: overviewRes.data ?? null,
    heatmap: heatmapRes?.data ?? null,
  });
});
