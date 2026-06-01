// Supabase Edge Function: ingest-events
// ─────────────────────────────────────────────────────────────────────────────
// Public, anonymous analytics intake. The client SDK (src/lib/track.js) batches
// pageview / click / scroll / rage / section / identify events and flushes them
// here via navigator.sendBeacon (or fetch keepalive). This is the ONLY writer
// to the analytics_* tables — it runs as service_role and calls the
// ingest_analytics_batch() RPC.
//
// Deployed with --no-verify-jwt: visitors have no account, so there's no JWT to
// verify. We defend the endpoint with: strict CORS (app origin only), a per-IP
// rate limit, a hard cap on batch size, bot-UA filtering, and field clamping.
//
// PRIVACY: the raw client IP is NEVER stored. We salt+SHA-256 it into an opaque
// ip_hash used solely as the geo-cache key and the rate-limit bucket. Geo
// (country/region/city/lat/lon) is resolved server-side from the IP via
// ipwho.is and cached per hash, so a returning visitor costs one indexed read,
// not an outbound API call.
//
// Required Edge Function secrets:
//   ANALYTICS_IP_SALT — random string; rotates the IP→hash mapping if leaked.
//   APP_URL           — already required by the shared CORS helper.
//   (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY auto-provided)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeadersFor } from '../_shared/cors.ts';

const MAX_EVENTS_PER_BATCH = 60;
const GEO_TTL_MS = 30 * 24 * 60 * 60 * 1000; // re-resolve a hashed IP monthly
const ALLOWED_TYPES = new Set([
  'pageview', 'click', 'scroll', 'rage', 'section', 'identify', 'custom',
]);

// Conservative bot heuristic. We only need to keep the firehose honest, not
// catch every crawler — false negatives just add a little noise, false
// positives would silently drop real humans, so we keep the list tight.
const BOT_RE = /bot|crawl|spider|slurp|bing|google|baidu|yandex|duckduck|facebookexternalhit|embedly|preview|headless|phantom|puppeteer|playwright|lighthouse|curl|wget|python-requests|axios|node-fetch/i;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

function clampStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

function clampInt(v: unknown, lo: number, hi: number): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

// First public IP from the proxy chain. x-forwarded-for is a comma list
// (client, proxy1, proxy2…); the leftmost is the real client on Supabase's
// edge. Falls back to x-real-ip.
function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() ?? '';
}

function isPrivateIp(ip: string): boolean {
  return !ip ||
    ip === '127.0.0.1' || ip === '::1' ||
    ip.startsWith('10.') || ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith('fc') || ip.startsWith('fd');
}

async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

type Geo = {
  country: string | null; country_code: string | null;
  region: string | null;  city: string | null;
  lat: number | null;     lon: number | null;
};
const EMPTY_GEO: Geo = { country: null, country_code: null, region: null, city: null, lat: null, lon: null };

// Resolve geo for a hashed IP: cache hit (fresh) → return; miss/stale → call
// ipwho.is and upsert the cache. Any failure degrades to EMPTY_GEO so events
// still land with null geo rather than failing the whole batch.
async function resolveGeo(
  admin: ReturnType<typeof createClient>,
  ipHash: string,
  rawIp: string,
): Promise<Geo> {
  try {
    const { data: cached } = await admin
      .from('analytics_ip_geo')
      .select('country, country_code, region, city, lat, lon, resolved_at')
      .eq('ip_hash', ipHash)
      .maybeSingle();
    if (cached && cached.resolved_at &&
        (Date.now() - new Date(cached.resolved_at).getTime()) < GEO_TTL_MS) {
      return {
        country: cached.country, country_code: cached.country_code,
        region: cached.region, city: cached.city,
        lat: cached.lat, lon: cached.lon,
      };
    }

    if (isPrivateIp(rawIp)) return EMPTY_GEO; // dev / LAN — don't bother geo

    const res = await fetch(
      `https://ipwho.is/${encodeURIComponent(rawIp)}?fields=success,country,country_code,region,city,latitude,longitude`,
      { signal: AbortSignal.timeout(2500) },
    );
    if (!res.ok) return EMPTY_GEO;
    const j = await res.json();
    if (!j?.success) return EMPTY_GEO;

    const geo: Geo = {
      country: clampStr(j.country, 60),
      country_code: clampStr(j.country_code, 2),
      region: clampStr(j.region, 80),
      city: clampStr(j.city, 80),
      lat: typeof j.latitude === 'number' ? j.latitude : null,
      lon: typeof j.longitude === 'number' ? j.longitude : null,
    };

    // Best-effort cache write; ignore failures.
    await admin.from('analytics_ip_geo').upsert({
      ip_hash: ipHash, ...geo, resolved_at: new Date().toISOString(),
    }, { onConflict: 'ip_hash' });

    return geo;
  } catch {
    return EMPTY_GEO;
  }
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  const ok = (status = 204) => new Response(null, { status, headers: cors });
  const bad = (status: number) => new Response(null, { status, headers: cors });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return bad(405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad(400); }

  const visitorId = body.visitor_id;
  const sessionId = body.session_id;
  if (!isUuid(visitorId) || !isUuid(sessionId)) return bad(400);
  const userId = isUuid(body.user_id) ? body.user_id : null;

  const rawEvents = Array.isArray(body.events) ? body.events : [];
  if (rawEvents.length === 0) return ok(); // nothing to do — not an error

  const device = (body.device ?? {}) as Record<string, unknown>;
  const ua = clampStr(device.ua, 400) ?? '';

  // Drop bots entirely — a 204 keeps the client quiet (it doesn't retry on 2xx).
  if (BOT_RE.test(ua)) return ok();

  const salt = Deno.env.get('ANALYTICS_IP_SALT') ?? '';
  const rawIp = clientIp(req);
  const ipHash = salt && rawIp ? await hashIp(rawIp, salt) : 'unknown';

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Per-IP rate limit. 120 batches/min is generous (the client flushes at most
  // every ~5s + on page hide) but caps a single host hammering the endpoint.
  const { data: allowed } = await admin.rpc('check_rate_limit', {
    bucket_key: `ingest:${ipHash}`, max_count: 120, window_seconds: 60,
  });
  if (allowed === false) return bad(429);

  const geo = await resolveGeo(admin, ipHash, rawIp);

  // Clamp + whitelist every event. Unknown types and oversized batches are
  // dropped silently rather than 400'd — the client is fire-and-forget and a
  // future event type shouldn't make old clients start erroring.
  const events = rawEvents
    .slice(0, MAX_EVENTS_PER_BATCH)
    .map((raw): Record<string, unknown> | null => {
      const e = (raw ?? {}) as Record<string, unknown>;
      const type = clampStr(e.type, 24);
      if (!type || !ALLOWED_TYPES.has(type)) return null;
      const props = (e.props && typeof e.props === 'object') ? e.props : {};
      return {
        type,
        path: clampStr(e.path, 120),
        referrer: clampStr(e.referrer, 500),
        props,
      };
    })
    .filter((e): e is Record<string, unknown> => e !== null);

  if (events.length === 0) return ok();

  const deviceClean = {
    device_type: clampStr(device.device_type, 16),
    os: clampStr(device.os, 32),
    browser: clampStr(device.browser, 32),
    ua,
    lang: clampStr(device.lang, 16),
    tz: clampStr(device.tz, 48),
    viewport_w: clampInt(device.viewport_w, 0, 20000),
    viewport_h: clampInt(device.viewport_h, 0, 20000),
    screen_w: clampInt(device.screen_w, 0, 20000),
    screen_h: clampInt(device.screen_h, 0, 20000),
  };

  const ft = (body.first_touch ?? {}) as Record<string, unknown>;
  const firstTouch = {
    source: clampStr(ft.source, 32),
    campaign: clampStr(ft.campaign, 60),
    affiliate: clampStr(ft.affiliate, 32),
    referrer: clampStr(ft.referrer, 500),
    landing_path: clampStr(ft.landing_path, 120),
  };

  const { error } = await admin.rpc('ingest_analytics_batch', {
    p_visitor_id: visitorId,
    p_session_id: sessionId,
    p_user_id: userId,
    p_geo: geo,
    p_device: deviceClean,
    p_first_touch: firstTouch,
    p_events: events,
  });

  if (error) {
    console.error('[ingest-events] ingest_analytics_batch failed:', error.message);
    return bad(500);
  }
  return ok();
});
