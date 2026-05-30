// Supabase Edge Function: admin-announcements
// ─────────────────────────────────────────────────────────────────────────────
// Operator-only CRUD for the in-app announcement / broadcast system, powering
// the Announce tab on /admin-me.
//
// Actions (POST body { action, ... }):
//   list                              → { announcements: [...] } (rollup via get_admin_announcement_stats)
//   create { title, body, segment, cta_label, cta_url, frequency, expires_at }
//                                     → { announcement }
//   update { id, patch:{ title?, body?, segment?, cta_label?, cta_url?,
//                        frequency?, active?, expires_at? } }
//                                     → { ok: true }
//   delete { id }                     → { ok: true }
//
// SECURITY: identical defense-in-depth to admin-referrals.
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

const SEGMENTS = new Set(['all', 'free', 'paid', 'inactive']);
const FREQUENCIES = new Set(['once', 'daily', 'always']);

function trimCap(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().slice(0, max);
  return s.length ? s : null;
}

// Normalize an optional datetime-local / ISO string into an ISO timestamp, or
// null when blank/invalid (meaning "no expiry").
function normalizeTs(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const d = new Date(raw as string);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
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
    bucket_key:     `admin-announcements:${user.id}`,
    max_count:      60,
    window_seconds: 60,
  });
  if (allowed === false) {
    return json({ error: 'Too many requests. Slow down and try again in a minute.' }, 429);
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const action = body?.action;

  // ── list: full rollup ─────────────────────────────────────────────────────
  if (action === 'list') {
    const { data, error } = await admin.rpc('get_admin_announcement_stats');
    if (error) {
      console.error('[admin-announcements] get_admin_announcement_stats failed:', error);
      return json({ error: error.message }, 500);
    }
    return json({ announcements: data ?? [] });
  }

  // ── create ────────────────────────────────────────────────────────────────
  if (action === 'create') {
    const bodyText = trimCap(body.body, 2000);
    if (!bodyText) return json({ error: 'Body is required.' }, 400);

    const segment = typeof body.segment === 'string' ? body.segment : 'all';
    if (!SEGMENTS.has(segment)) return json({ error: 'Invalid segment.' }, 400);

    const frequency = typeof body.frequency === 'string' ? body.frequency : 'once';
    if (!FREQUENCIES.has(frequency)) return json({ error: 'Invalid frequency.' }, 400);

    const row: Record<string, unknown> = {
      title:      trimCap(body.title, 160),
      body:       bodyText,
      segment,
      cta_label:  trimCap(body.cta_label, 80),
      cta_url:    trimCap(body.cta_url, 500),
      frequency,
      expires_at: normalizeTs(body.expires_at),
      created_by: user.id,
    };

    const { data, error } = await admin
      .from('announcements')
      .insert(row)
      .select('id, title, body, segment, cta_label, cta_url, active, frequency, starts_at, expires_at, created_at')
      .single();
    if (error) {
      console.error('[admin-announcements] create failed:', error);
      return json({ error: error.message }, 500);
    }
    return json({ announcement: data });
  }

  // ── update ────────────────────────────────────────────────────────────────
  if (action === 'update') {
    const id = body.id;
    if (!id) return json({ error: 'Missing announcement id' }, 400);
    const patch = body.patch ?? {};
    const update: Record<string, unknown> = {};

    if ('title' in patch)     update.title = trimCap(patch.title, 160);
    if ('body' in patch) {
      const b = trimCap(patch.body, 2000);
      if (!b) return json({ error: 'Body cannot be empty.' }, 400);
      update.body = b;
    }
    if ('cta_label' in patch) update.cta_label = trimCap(patch.cta_label, 80);
    if ('cta_url' in patch)   update.cta_url = trimCap(patch.cta_url, 500);
    if ('active' in patch)    update.active = !!patch.active;
    if ('expires_at' in patch) update.expires_at = normalizeTs(patch.expires_at);
    if ('segment' in patch) {
      if (!SEGMENTS.has(patch.segment)) return json({ error: 'Invalid segment.' }, 400);
      update.segment = patch.segment;
    }
    if ('frequency' in patch) {
      if (!FREQUENCIES.has(patch.frequency)) return json({ error: 'Invalid frequency.' }, 400);
      update.frequency = patch.frequency;
    }
    if (Object.keys(update).length === 0) return json({ error: 'Nothing to update' }, 400);

    const { error } = await admin.from('announcements').update(update).eq('id', id);
    if (error) {
      console.error('[admin-announcements] update failed:', error);
      return json({ error: error.message }, 500);
    }
    return json({ ok: true });
  }

  // ── delete ────────────────────────────────────────────────────────────────
  if (action === 'delete') {
    const id = body.id;
    if (!id) return json({ error: 'Missing announcement id' }, 400);
    const { error } = await admin.from('announcements').delete().eq('id', id);
    if (error) {
      console.error('[admin-announcements] delete failed:', error);
      return json({ error: error.message }, 500);
    }
    return json({ ok: true });
  }

  return json({ error: 'Unknown action' }, 400);
});
