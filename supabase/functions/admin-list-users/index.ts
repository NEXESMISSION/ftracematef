// Supabase Edge Function: admin-list-users
// ─────────────────────────────────────────────────────────────────────────────
// Powers the secret /admin-me dashboard. Returns every profile + its current
// active subscription (if any) so the operator can scan paying customers,
// expirations, and "online now" presence in one place.
//
// SECURITY: defense-in-depth.
//   1. Authorization header must verify against Supabase auth.
//   2. The caller's email must be on the ADMIN_EMAILS allowlist (env var,
//      never bundled into the frontend).
//   3. The caller's profiles.is_admin must also be true (DB-side gate that
//      can be flipped without redeploying the function).
//   Both (2) AND (3) must pass — losing either still locks the endpoint.
//   4. Rate-limited to 60 calls/min per admin so a runaway client can't
//      spin the (potentially-large) profiles + subscriptions read.
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

  // Gate #1: env-var allowlist. Bundle-safe — never reaches the browser.
  if (!isAdminEmail(user.email)) return json({ error: 'Not authorized' }, 403);

  // Service-role client — needed to read other users' profiles + subscriptions.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Gate #2: profiles.is_admin on the caller. DB-side flag so admin can be
  // revoked via SQL without redeploying. Cross-checked against the env var
  // above so neither one alone unlocks the endpoint.
  const { data: callerProfile, error: callerErr } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (callerErr) return json({ error: 'Profile lookup failed' }, 500);
  if (!callerProfile?.is_admin) return json({ error: 'Not authorized' }, 403);

  // Rate-limit per admin.
  const { data: allowed } = await supabaseAuth.rpc('check_rate_limit', {
    bucket_key:     `admin-list-users:${user.id}`,
    max_count:      60,
    window_seconds: 60,
  });
  if (allowed !== true) {
    return json({ error: 'Too many requests. Slow down and try again in a minute.' }, 429);
  }

  // Reconcile any zombie trace_session_runs first — the operator should
  // never see a phantom "still tracing" row for a user whose tab was killed.
  // Closes any run whose heartbeat has been silent for >45s, crediting the
  // duration up to the last heartbeat. Idempotent — safe to call on every
  // request, only touches rows that need it.
  const { error: reconcileErr } = await admin.rpc('reconcile_trace_runs', {
    p_stale_seconds: 45,
  });
  if (reconcileErr) {
    // Non-fatal: presence data is still useful even if the sweep failed.
    // Log and continue rather than failing the whole dashboard read.
    console.warn('[admin-list-users] reconcile_trace_runs failed:', reconcileErr);
  }

  // Pull profiles + subscriptions separately and stitch in-memory. Two flat
  // queries are cheaper than a join via PostgREST's nested select on small-
  // to-medium account counts (a few thousand rows) and easier to reason
  // about than the foreign-key embed magic.
  const { data: profiles, error: profErr } = await admin
    .from('profiles')
    .select('id, email, display_name, avatar_url, is_admin, created_at, last_seen_at, free_trial_started_at, free_sessions_used, dodo_customer_id, total_trace_seconds, trace_sessions, traces_recorded, first_trace_at, last_trace_at, current_page, current_image_label, current_run_id, signup_landing, signup_referrer, signup_source, signup_campaign, first_pricing_at, first_paywall_at, first_checkout_at, last_checkout_at, last_checkout_plan, exit_survey_at, exit_survey_source, exit_survey_feeling, exit_survey_note, survey_completed_at, survey_age, survey_draws, survey_note')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (profErr) return json({ error: profErr.message }, 500);

  const { data: subs, error: subsErr } = await admin
    .from('subscriptions')
    .select('user_id, plan, status, current_period_end, cancel_at_next_billing_date, amount_cents, currency, dodo_subscription_id, created_at, updated_at, cancelled_at')
    .order('created_at', { ascending: false });
  if (subsErr) return json({ error: subsErr.message }, 500);

  // Pull auth.users.last_sign_in_at so users who haven't pinged the heartbeat
  // since the column was added still show a meaningful "last seen". This is
  // Supabase's built-in stamp on every successful sign-in, so it's always
  // populated for anyone who's logged in at least once.
  // Paginate defensively: admin.listUsers() caps at 1000 per call. Two pages
  // covers the same 2000-row ceiling we use on profiles above; if you outgrow
  // that, raise both ceilings together.
  const lastSignIn = new Map<string, string | null>();
  for (const page of [1, 2]) {
    const { data: pageData, error: authErr } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (authErr) {
      console.warn('[admin-list-users] auth.listUsers page', page, 'failed:', authErr);
      break;
    }
    for (const u of pageData?.users ?? []) {
      lastSignIn.set(u.id, u.last_sign_in_at ?? null);
    }
    if ((pageData?.users?.length ?? 0) < 1000) break;
  }

  // Index the most-recent active row per user. The unique-active partial
  // index guarantees at most one matches, but we walk the array defensively
  // (latest-first ordering above means the first hit is also the freshest).
  type SubRow = {
    user_id: string;
    plan: string | null;
    status: string | null;
    current_period_end: string | null;
    cancel_at_next_billing_date: boolean | null;
    amount_cents: number | null;
    currency: string | null;
    dodo_subscription_id: string | null;
    created_at: string | null;
    updated_at: string | null;
    cancelled_at: string | null;
  };
  const activeByUser = new Map<string, SubRow>();
  const latestByUser = new Map<string, SubRow>();
  for (const s of (subs ?? []) as SubRow[]) {
    if (!latestByUser.has(s.user_id)) latestByUser.set(s.user_id, s);
    if (s.status === 'active' && !activeByUser.has(s.user_id)) {
      activeByUser.set(s.user_id, s);
    }
  }

  const RENEWAL_GRACE_MS = 6 * 60 * 60 * 1000;
  const now = Date.now();

  const isPaidNow = (s: SubRow | undefined) => {
    if (!s) return false;
    if (s.plan === 'free' || s.status !== 'active') return false;
    if (s.plan === 'lifetime') return true;
    if (!s.current_period_end) return false;
    const endMs = new Date(s.current_period_end).getTime();
    if (s.cancel_at_next_billing_date) return endMs > now;
    return endMs + RENEWAL_GRACE_MS > now;
  };

  const users = (profiles ?? []).map((p) => {
    const sub = activeByUser.get(p.id) ?? latestByUser.get(p.id) ?? null;
    return {
      id:                  p.id,
      email:               p.email,
      display_name:        p.display_name,
      avatar_url:          p.avatar_url,
      is_admin:            !!p.is_admin,
      created_at:          p.created_at,
      last_seen_at:        p.last_seen_at,
      last_sign_in_at:     lastSignIn.get(p.id) ?? null,
      dodo_customer_id:    p.dodo_customer_id ?? null,
      trial_used:          !!p.free_trial_started_at,
      free_sessions_used:  p.free_sessions_used ?? 0,
      // Subscription view (null when the user has no row yet, which can
      // only happen if the signup trigger failed for some reason).
      plan:                sub?.plan ?? null,
      status:              sub?.status ?? null,
      current_period_end:  sub?.current_period_end ?? null,
      cancel_at_period_end: !!sub?.cancel_at_next_billing_date,
      amount_cents:        sub?.amount_cents ?? null,
      currency:            sub?.currency ?? null,
      // Best-available "when did they pay?" signal:
      //  - For an active paid plan, the subscription row's created_at is the
      //    time the webhook activated it (new sub_id => fresh insert).
      //  - For users still on the trigger-created free row, this is signup
      //    time, which is fine — they haven't paid.
      paid_at:             sub && sub.plan !== 'free' ? sub.created_at : null,
      sub_updated_at:      sub?.updated_at ?? null,
      cancelled_at:        sub?.cancelled_at ?? null,
      is_paid:             isPaidNow(sub ?? undefined),
      // Trace stats — server-side mirror of the user's /account scrapbook
      // tiles. Written by the record_trace_session RPC; nullable when the
      // user hasn't traced yet (seeded via column defaults to 0/null).
      total_trace_seconds: p.total_trace_seconds ?? 0,
      trace_sessions:      p.trace_sessions ?? 0,
      // Sessions that produced a saved/downloaded recording — best
      // "did they keep a result?" engagement signal we have today.
      traces_recorded:     p.traces_recorded ?? 0,
      first_trace_at:      p.first_trace_at ?? null,
      last_trace_at:       p.last_trace_at ?? null,
      // Journey funnel — sparse "first occurrence" stamps. The admin UI
      // uses these to classify each user (ghost / curious / tried / paywalled
      // / abandoned / paid) so an operator can see at a glance why a row
      // is sitting at "0 sessions". NULLs for users who signed up before
      // 20260506200000_user_journey.sql landed — handle gracefully in the UI.
      signup_landing:      p.signup_landing ?? null,
      signup_referrer:     p.signup_referrer ?? null,
      signup_source:       p.signup_source ?? null,
      signup_campaign:     p.signup_campaign ?? null,
      first_pricing_at:    p.first_pricing_at ?? null,
      first_paywall_at:    p.first_paywall_at ?? null,
      first_checkout_at:   p.first_checkout_at ?? null,
      // Latest checkout attempt + which plan they opened on Dodo. Sticky
      // null for users who signed up before 20260513000000_last_checkout_plan
      // landed AND for any pre-existing first_checkout_at row that never
      // saw a re-attempt — the admin UI falls back to a generic "Bailed
      // checkout" pill in that case.
      last_checkout_at:    p.last_checkout_at ?? null,
      last_checkout_plan:  p.last_checkout_plan ?? null,
      // Legacy exit-survey answers — kept for historical rows, no longer
      // written by the client (replaced by the post-trace survey below).
      exit_survey_at:      p.exit_survey_at ?? null,
      exit_survey_source:  p.exit_survey_source ?? null,
      exit_survey_feeling: p.exit_survey_feeling ?? null,
      exit_survey_note:    p.exit_survey_note ?? null,
      // Post-trace survey — age + what they like to draw, stamped once after
      // the user's first trace. Drives the SurveyPanel rollup + the
      // recommendation flywheel.
      survey_completed_at: p.survey_completed_at ?? null,
      survey_age:          p.survey_age ?? null,
      survey_draws:        Array.isArray(p.survey_draws) ? p.survey_draws : [],
      survey_note:         p.survey_note ?? null,
      // Live presence — what page the user is on right now, and the image
      // they're tracing if they're in the studio. Only meaningful when the
      // user is also "online" (last_seen_at within the heartbeat window);
      // the dashboard UI gates on online-ness before rendering these.
      current_page:        p.current_page ?? null,
      current_image_label: p.current_image_label ?? null,
      current_run_id:      p.current_run_id ?? null,
    };
  });

  return json({ users });
});
