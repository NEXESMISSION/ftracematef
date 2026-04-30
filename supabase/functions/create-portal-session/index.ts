// Supabase Edge Function: create-portal-session
// ─────────────────────────────────────────────────────────────────────────────
// Mints a fresh, signed Customer Portal URL via the official Dodo SDK and
// returns it to the frontend (called from Account → "Manage billing").
//
// Required Edge Function secrets:
//   DODO_API_KEY        — server-side API key
//   DODO_ENVIRONMENT    — "test_mode" | "live_mode"
// ─────────────────────────────────────────────────────────────────────────────

import DodoPayments from 'npm:dodopayments@1';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  const reply = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')    return reply({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return reply({ error: 'Missing Authorization header' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return reply({ error: 'Not authenticated' }, 401);
  const user = userData.user;

  // Rate limit: 10 portal-session creations/minute per user. Each call mints
  // a fresh signed Dodo customer-portal URL — there's no good reason a
  // legitimate user needs more than a couple per minute, and an attacker
  // spamming this would burn both our function budget and Dodo's API quota.
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    bucket_key:     `portal-session:${user.id}`,
    max_count:      10,
    window_seconds: 60,
  });
  if (allowed === false) {
    return reply({ error: 'Too many requests. Slow down and try again in a minute.' }, 429);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('dodo_customer_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.dodo_customer_id) {
    return reply({ error: 'No Dodo customer linked yet — buy a plan first.' }, 404);
  }

  const apiKey = Deno.env.get('DODO_API_KEY');
  if (!apiKey) return reply({ error: 'Server misconfigured: DODO_API_KEY missing' }, 500);

  try {
    const client = new DodoPayments({
      bearerToken: apiKey,
      environment: (Deno.env.get('DODO_ENVIRONMENT') ?? 'test_mode') as
        | 'test_mode'
        | 'live_mode',
    });

    // Official SDK call — returns { link: string }
    const session = await client.customers.customerPortal.create(
      profile.dodo_customer_id,
    );

    return reply({ portal_url: session.link });
  } catch (err) {
    // Log the raw error server-side for debugging; return a generic message
    // so Dodo internal IDs / API tokens / request IDs never reach the client.
    console.error('Dodo portal session failed:', err);
    return reply({ error: 'Could not open the billing portal. Please try again, or contact support if it persists.' }, 502);
  }
});
