// Supabase Edge Function: list-payments
// ─────────────────────────────────────────────────────────────────────────────
// Returns the authenticated user's recent payments from Dodo, filtered by the
// user's dodo_customer_id. Used by the Profile page to show payment history.
//
// Required Edge Function secrets:
//   DODO_API_KEY, DODO_ENVIRONMENT
// ─────────────────────────────────────────────────────────────────────────────

import DodoPayments from 'npm:dodopayments@1';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';

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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'Not authenticated' }, 401);
  const user = userData.user;

  // Rate limit: 30 calls/minute per user. The Account page calls this on
  // mount and again whenever the user expands the receipts panel — 30/min
  // covers normal usage by ~10x but caps a tab that's spamming the endpoint
  // (each call hits Dodo's payments.list API, burning their quota too).
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    bucket_key:     `list-payments:${user.id}`,
    max_count:      30,
    window_seconds: 60,
  });
  if (allowed === false) {
    return json({ error: 'Too many requests. Slow down and try again in a minute.' }, 429);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('dodo_customer_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.dodo_customer_id) {
    // Brand-new user with no purchases yet — return empty list, not an error.
    return json({ payments: [] });
  }

  const apiKey = Deno.env.get('DODO_API_KEY');
  if (!apiKey) return json({ error: 'Server misconfigured: DODO_API_KEY missing' }, 500);

  try {
    const client = new DodoPayments({
      bearerToken: apiKey,
      environment: (Deno.env.get('DODO_ENVIRONMENT') ?? 'test_mode') as
        | 'test_mode'
        | 'live_mode',
    });

    const result = await client.payments.list({
      customer_id: profile.dodo_customer_id,
      page_size: 25,
    } as any);

    // Page object → flat array of trimmed fields the UI cares about.
    // We expose `product_id` rather than the misleading `product_name` we
    // used to send (it was always the id anyway). The Account UI maps
    // ids → friendly names via PLAN_LABEL.
    const items = (result?.items ?? []).map((p: any) => ({
      id:         p.payment_id ?? p.id,
      created_at: p.created_at ?? p.timestamp,
      total:      p.total_amount ?? p.amount ?? null,
      currency:   p.currency ?? 'USD',
      status:     p.status ?? null,
      product_id: p.product_cart?.[0]?.product_id ?? null,
    }));

    return json({ payments: items });
  } catch (err) {
    console.error('Dodo list payments failed:', err);
    return json({ error: 'Could not fetch payment history. Please try again later.' }, 502);
  }
});
