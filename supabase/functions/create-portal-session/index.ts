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
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const { data: profile } = await supabase
    .from('profiles')
    .select('dodo_customer_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.dodo_customer_id) {
    return json({ error: 'No Dodo customer linked yet — buy a plan first.' }, 404);
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

    // Official SDK call — returns { link: string }
    const session = await client.customers.customerPortal.create(
      profile.dodo_customer_id,
    );

    return json({ portal_url: session.link });
  } catch (err) {
    console.error('Dodo portal session failed:', err);
    return json({ error: (err as Error)?.message ?? 'Could not create portal session' }, 502);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
