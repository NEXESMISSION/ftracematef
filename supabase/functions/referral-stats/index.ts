// Supabase Edge Function: referral-stats  (PUBLIC — deploy with --no-verify-jwt)
// ─────────────────────────────────────────────────────────────────────────────
// Affiliate self-view. A partner opens tracemate.art/partner?t=<access_token>
// and sees ONLY their own numbers (signups, sales, commission earned / pending
// / paid) — no buyer PII, no other partners' data. The token is the secret;
// it's per-referrer and rotatable from the operator dashboard.
//
// This function takes no Supabase JWT (partners have no account), so it MUST be
// deployed with `--no-verify-jwt`. The access_token is the sole credential.
//
// Defense:
//   - Looks the token up server-side under the service role; an unknown token
//     returns 404 (no oracle on which tokens are close).
//   - Rate-limited per token to blunt brute-force enumeration of the uuid
//     space (which is already 122 bits of entropy).
//   - Returns a curated subset of get_referral_stats() — never the access
//     tokens of other referrers, never any buyer identity.
//
// (SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY auto-provided)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!UUID_RE.test(token)) return json({ error: 'Invalid token' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Rate-limit per token (check_rate_limit is granted to service_role).
  const { data: allowed } = await admin.rpc('check_rate_limit', {
    bucket_key:     `referral-stats:${token}`,
    max_count:      30,
    window_seconds: 60,
  });
  if (allowed === false) {
    return json({ error: 'Too many requests. Try again in a minute.' }, 429);
  }

  // Resolve the token → referrer id first (cheap, indexed), then pull the
  // aggregates. We compute the rollup via get_referral_stats() and pick our
  // row out of it so the math lives in exactly one place (the SQL function).
  const { data: ref, error: refErr } = await admin
    .from('referrers')
    .select('id')
    .eq('access_token', token)
    .maybeSingle();
  if (refErr) return json({ error: 'Lookup failed' }, 500);
  if (!ref) return json({ error: 'Not found' }, 404);

  const { data: rows, error: statsErr } = await admin.rpc('get_referral_stats');
  if (statsErr) {
    console.error('[referral-stats] get_referral_stats failed:', statsErr);
    return json({ error: 'Could not load stats' }, 500);
  }

  const mine = (Array.isArray(rows) ? rows : []).find((r: any) => r.id === ref.id);
  if (!mine) return json({ error: 'Not found' }, 404);

  // Curate: expose only what the partner needs. Crucially, DROP access_token
  // (and never had buyer ids to begin with).
  return json({
    referrer: {
      code:                      mine.code,
      name:                      mine.name ?? null,
      active:                    mine.active,
      commission_rate_bps:       mine.commission_rate_bps,
      commission_flat_cents:     mine.commission_flat_cents,
      signups:                   mine.signups ?? 0,
      paying_now:                mine.paying_now ?? 0,
      sales:                     mine.sales ?? 0,
      commission_total_cents:    mine.commission_total_cents ?? 0,
      commission_pending_cents:  mine.commission_pending_cents ?? 0,
      commission_paid_cents:     mine.commission_paid_cents ?? 0,
    },
  });
});
