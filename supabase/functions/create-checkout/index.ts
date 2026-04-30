// Supabase Edge Function: create-checkout
// ─────────────────────────────────────────────────────────────────────────────
// Creates a Dodo Payments checkout session for the authenticated user.
//
// Best-practice notes (per Dodo docs):
// - Uses the official `dodopayments` Node SDK (no raw fetch / URL drift)
// - Verifies the caller's Supabase JWT before exposing anything
// - Stuffs the user's id into `metadata` so the webhook can match the
//   eventual subscription back to a row in `public.subscriptions`
// - Refuses lifetime checkouts when 10 spots are taken (server-side guard)
//
// Required Edge Function secrets:
//   DODO_API_KEY              — server-side API key from Dodo dashboard
//   DODO_ENVIRONMENT          — "test_mode" | "live_mode"
//   DODO_PRODUCT_MONTHLY      — Dodo product ID for the monthly plan
//   DODO_PRODUCT_QUARTERLY    — Dodo product ID for the 3-month plan
//   DODO_PRODUCT_LIFETIME     — Dodo product ID for the lifetime plan
//   APP_URL                   — public URL of your app (e.g. https://tracemate.art)
// (SUPABASE_URL + SUPABASE_ANON_KEY are auto-provided by Supabase)
// ─────────────────────────────────────────────────────────────────────────────

import DodoPayments from 'npm:dodopayments@1';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const PLAN_TO_PRODUCT_ENV: Record<string, string> = {
  monthly:   'DODO_PRODUCT_MONTHLY',
  quarterly: 'DODO_PRODUCT_QUARTERLY',
  lifetime:  'DODO_PRODUCT_LIFETIME',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  // 1. Identify the caller via their Supabase JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Not authenticated' }, 401);

  // Defensive: rare Google accounts come through without an email. The Dodo
  // SDK requires one. Refuse early with a clear message rather than crashing
  // with a non-null assertion stack trace.
  if (!user.email) {
    return json({ error: 'Account is missing an email address. Try signing in with a different account.' }, 400);
  }

  // Rate limit: 5 checkout sessions per 5 minutes per user. Each call mints a
  // real Dodo checkout session — easy to abuse without a cap.
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    bucket_key:     `checkout:${user.id}`,
    max_count:      5,
    window_seconds: 300,
  });
  if (allowed === false) {
    return json({ error: 'Too many checkout attempts. Try again in a few minutes.' }, 429);
  }

  // 2. Validate the requested plan
  let body: { plan?: string } = {};
  try { body = await req.json(); } catch { /* ignored */ }
  const plan = body.plan;

  if (!plan || !PLAN_TO_PRODUCT_ENV[plan]) {
    return json({ error: 'Invalid plan' }, 400);
  }

  const productId = Deno.env.get(PLAN_TO_PRODUCT_ENV[plan]);
  if (!productId) return json({ error: `Missing product env var for ${plan}` }, 500);

  // 3. Server-side guard: block lifetime checkout when sold out
  if (plan === 'lifetime') {
    const { data: seatsLeft } = await supabase.rpc('lifetime_seats_left');
    if (typeof seatsLeft === 'number' && seatsLeft <= 0) {
      return json({ error: 'Lifetime is sold out' }, 409);
    }
  }

  // 4. Read the user's profile (for the customer name)
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  // 5. Create the checkout session via the official Dodo SDK
  const apiKey = Deno.env.get('DODO_API_KEY');
  if (!apiKey) return json({ error: 'Server misconfigured: DODO_API_KEY missing' }, 500);

  try {
    const client = new DodoPayments({
      bearerToken: apiKey,
      environment: (Deno.env.get('DODO_ENVIRONMENT') ?? 'test_mode') as
        | 'test_mode'
        | 'live_mode',
    });

    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173';

    const session = await client.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: {
        email: user.email,
        name:  profile?.display_name ?? user.email.split('@')[0] ?? 'Trace Mate user',
      },
      // Where Dodo redirects after successful payment
      return_url: `${appUrl}/checkout/success`,
      // Where Dodo redirects if the user backs out of checkout
      cancel_url: `${appUrl}/account`,
      // Recommended UX flags
      feature_flags: {
        allow_discount_code: true,
        allow_phone_number_collection: false,
      },
      // Stuff identifying this user into Dodo's metadata so the webhook
      // can match the eventual subscription back to a row in Postgres.
      metadata: {
        supabase_user_id: user.id,
        plan,
      },
    });

    return json({
      checkout_url: session.checkout_url,
      session_id:   session.session_id,
    });
  } catch (err) {
    // Log full detail server-side; return a generic message to the client so
    // we don't leak internal Dodo IDs / debug strings into a production UI.
    // TEMP DEBUG: also surface the Dodo error message + status so the client
    // toast tells us what's actually wrong. Lock this back down once
    // checkout works end-to-end (replace `details` with just the generic msg).
    console.error('Dodo checkout failed:', err);
    const detail = err instanceof Error ? err.message : String(err);
    const status = (err && typeof err === 'object' && 'status' in err && typeof err.status === 'number') ? err.status : null;
    return json({
      error:   'Could not start checkout. Please try again in a moment.',
      details: detail,
      dodo_status: status,
    }, 502);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
