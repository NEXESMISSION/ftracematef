// Supabase Edge Function: admin-referrals
// ─────────────────────────────────────────────────────────────────────────────
// Operator-only CRUD + payout management for the referral / affiliate system,
// powering the Referrals tab on /admin-me.
//
// Actions (POST body { action, ... }):
//   list                              → { referrers: [...] }  (rollup via get_referral_stats)
//   create { name, email, code?, commission_rate_bps?, commission_flat_cents? }
//                                     → { referrer } (code auto-generated when omitted)
//   update { id, patch:{ name?, email?, code?, active?, commission_rate_bps?,
//                        commission_flat_cents?, notes? } }
//                                     → { ok: true }
//   rotate_token { id }               → { access_token }
//   mark_paid { referrer_id }         → { updated: <count> }  (all pending → paid)
//
// SECURITY: identical defense-in-depth to admin-stats / admin-list-users.
//   1. Authorization header verifies against Supabase auth.
//   2. Caller email on the ADMIN_EMAILS allowlist (env, never bundled).
//   3. Caller profiles.is_admin = true.
//   4. Rate-limited per admin.
//
// Required Edge Function secrets:
//   ADMIN_EMAILS — comma-separated allowlist (case-insensitive)
//   (SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY auto-provided)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';
import { isAdminEmail } from '../_shared/admin.ts';

const SLUG_RE = /^[a-z0-9_-]+$/;

function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const c = raw.trim().toLowerCase().slice(0, 32);
  if (!c || !SLUG_RE.test(c)) return null;
  return c;
}

// Random url-safe slug for auto-generated codes (no ambiguous chars).
function randomCode(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

// Clamp commission rate to a sane 0–100% range (basis points).
function clampBps(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10000, Math.round(n)));
}

function clampCents(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

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

  // Gate #1: env-var allowlist.
  if (!isAdminEmail(user.email)) return json({ error: 'Not authorized' }, 403);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Gate #2: profiles.is_admin on the caller.
  const { data: callerProfile, error: callerErr } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (callerErr) return json({ error: 'Profile lookup failed' }, 500);
  if (!callerProfile?.is_admin) return json({ error: 'Not authorized' }, 403);

  // Rate-limit per admin.
  const { data: allowed } = await supabaseAuth.rpc('check_rate_limit', {
    bucket_key:     `admin-referrals:${user.id}`,
    max_count:      60,
    window_seconds: 60,
  });
  if (allowed === false) {
    return json({ error: 'Too many requests. Slow down and try again in a minute.' }, 429);
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const action = body?.action;

  // ── list: full rollup ─────────────────────────────────────────────────
  if (action === 'list') {
    const { data, error } = await admin.rpc('get_referral_stats');
    if (error) {
      console.error('[admin-referrals] get_referral_stats failed:', error);
      return json({ error: error.message }, 500);
    }
    return json({ referrers: data ?? [] });
  }

  // ── create ──────────────────────────────────────────────────────────────
  if (action === 'create') {
    const name  = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : null;
    const email = typeof body.email === 'string' ? body.email.trim().slice(0, 200) : null;
    // Explicit code if valid, else auto-generate one and retry on collision.
    let code = normalizeCode(body.code) ?? randomCode();
    const rate = clampBps(body.commission_rate_bps);
    const flat = clampCents(body.commission_flat_cents);

    const row: Record<string, unknown> = {
      name,
      email,
      code,
      commission_rate_bps:   rate ?? 2000,
      commission_flat_cents: flat,
    };

    // Try insert; on a unique-violation (code taken) regenerate once or twice.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data, error } = await admin
        .from('referrers')
        .insert(row)
        .select('id, code, name, email, commission_rate_bps, commission_flat_cents, active, access_token, notes, created_at')
        .single();
      if (!error) return json({ referrer: data });
      if ((error as any).code === '23505') {
        // Only auto-retry when the caller didn't pin a specific code.
        if (normalizeCode(body.code)) {
          return json({ error: `Code "${code}" is already taken — pick another.` }, 409);
        }
        code = randomCode();
        row.code = code;
        continue;
      }
      console.error('[admin-referrals] create failed:', error);
      return json({ error: error.message }, 500);
    }
    return json({ error: 'Could not allocate a unique code — try again.' }, 500);
  }

  // ── update ───────────────────────────────────────────────────────────────
  if (action === 'update') {
    const id = body.id;
    if (!id) return json({ error: 'Missing referrer id' }, 400);
    const patch = body.patch ?? {};
    const update: Record<string, unknown> = {};

    if ('name' in patch)   update.name  = typeof patch.name === 'string' ? patch.name.trim().slice(0, 120) : null;
    if ('email' in patch)  update.email = typeof patch.email === 'string' ? patch.email.trim().slice(0, 200) : null;
    if ('notes' in patch)  update.notes = typeof patch.notes === 'string' ? patch.notes.trim().slice(0, 2000) : null;
    if ('active' in patch) update.active = !!patch.active;
    if ('commission_rate_bps' in patch) {
      const r = clampBps(patch.commission_rate_bps);
      if (r === null) return json({ error: 'Invalid commission rate' }, 400);
      update.commission_rate_bps = r;
    }
    if ('commission_flat_cents' in patch) {
      update.commission_flat_cents = clampCents(patch.commission_flat_cents);
    }
    if ('code' in patch) {
      const c = normalizeCode(patch.code);
      if (!c) return json({ error: 'Invalid code — use lowercase letters, numbers, - or _' }, 400);
      update.code = c;
    }
    if (Object.keys(update).length === 0) return json({ error: 'Nothing to update' }, 400);

    const { error } = await admin.from('referrers').update(update).eq('id', id);
    if (error) {
      if ((error as any).code === '23505') return json({ error: 'That code is already taken.' }, 409);
      console.error('[admin-referrals] update failed:', error);
      return json({ error: error.message }, 500);
    }
    return json({ ok: true });
  }

  // ── rotate_token ─────────────────────────────────────────────────────────
  if (action === 'rotate_token') {
    const id = body.id;
    if (!id) return json({ error: 'Missing referrer id' }, 400);
    const newToken = crypto.randomUUID();
    const { error } = await admin
      .from('referrers')
      .update({ access_token: newToken })
      .eq('id', id);
    if (error) return json({ error: error.message }, 500);
    return json({ access_token: newToken });
  }

  // ── mark_paid: flip all pending commissions for a referrer to paid ────────
  if (action === 'mark_paid') {
    const referrerId = body.referrer_id;
    if (!referrerId) return json({ error: 'Missing referrer_id' }, 400);
    const { data, error } = await admin
      .from('referral_commissions')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('referrer_id', referrerId)
      .eq('status', 'pending')
      .select('id');
    if (error) {
      console.error('[admin-referrals] mark_paid failed:', error);
      return json({ error: error.message }, 500);
    }
    return json({ updated: data?.length ?? 0 });
  }

  return json({ error: 'Unknown action' }, 400);
});
