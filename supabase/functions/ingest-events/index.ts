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

// Whitelist + clamp the per-event `props`. The public endpoint must never store
// arbitrary client JSON (size/DoS + junk), so we keep only the known keys with
// bounded types. Unknown keys are dropped.
const PROP_STR_KEYS = new Set(['sel', 'txt', 'name', 'id']);
// Numeric props are clamped to sane per-key ranges. Without this a buggy/hostile
// client could send depth=1e9 (counts toward every scroll bucket) or xpct/ypct
// far outside 0..1 (pushes heatmap points off-canvas) and silently corrupt the
// rollup math. The ranges below match how each value is actually consumed:
//   xpct/ypct  → fractional heatmap coordinates (0..1)
//   depth      → scroll-depth percentage, bucketed at 25/50/75/100 (0..100)
//   ypage      → absolute Y in CSS px (generous page-height ceiling)
//   vw         → viewport width in px
//   count      → repeat-count (e.g. rage clicks); generous ceiling
const PROP_NUM_BOUNDS: Record<string, [number, number]> = {
  xpct: [0, 1], ypct: [0, 1], depth: [0, 100],
  ypage: [0, 1_000_000], vw: [0, 20_000], count: [0, 100_000],
};
function sanitizeProps(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (PROP_STR_KEYS.has(k)) {
      const s = clampStr(v, 200);
      if (s) out[k] = s;
    } else if (k in PROP_NUM_BOUNDS) {
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(n)) {
        const [lo, hi] = PROP_NUM_BOUNDS[k];
        out[k] = Math.max(lo, Math.min(hi, n));
      }
    } else if (k === 'session_start') {
      if (v === true) out[k] = true;
    }
    // anything else: dropped
  }
  return out;
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
  // We deliberately IGNORE any client-supplied user_id: the public endpoint has
  // no JWT, so trusting it would let anyone attribute forged traffic to a
  // victim's account. The anonymous→account stitch is done by the AUTHENTICATED
  // link_visitor RPC (called from the client after sign-in), where the user is
  // derived from auth.uid() server-side.
  const userId = null;

  const rawEvents = Array.isArray(body.events) ? body.events : [];
  if (rawEvents.length === 0) return ok(); // nothing to do — not an error

  const device = (body.device ?? {}) as Record<string, unknown>;
  const ua = clampStr(device.ua, 400) ?? '';

  // Drop bots entirely — a 204 keeps the client quiet (it doesn't retry on 2xx).
  // An empty/absent UA is treated as a bot too: real browsers always populate
  // navigator.userAgent, so a blank (or trivially short) one is a script/scraper
  // that would otherwise sail past BOT_RE.test('') === false and land
  // real-looking events, inflating every visitor/funnel number.
  if (!ua || ua.length < 8 || BOT_RE.test(ua)) return ok();

  const salt = Deno.env.get('ANALYTICS_IP_SALT') ?? '';
  const rawIp = clientIp(req);
  const ipHash = salt && rawIp ? await hashIp(rawIp, salt) : 'unknown';

  // Device key for dedup: hash(ip_hash + user-agent). Deterministic for a given
  // machine+network so incognito / cleared storage / a second browser on the
  // SAME device collapse to one visitor. Null when we couldn't derive an IP
  // hash (private/LAN/dev) so those aren't all merged together.
  const deviceKey = (ipHash !== 'unknown' && ua)
    ? await hashIp(`${ipHash}|${ua}`, salt)
    : null;

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Per-IP rate limit. 60 batches/min is plenty (the client flushes at most
  // every ~5s + on page hide ≈ 12-15/min) but caps a host hammering the
  // endpoint. Fail CLOSED: a null/errored result (not an explicit `true`) is
  // treated as over-limit so a transient DB hiccup can't open the floodgates.
  const { data: allowed } = await admin.rpc('check_rate_limit', {
    bucket_key: `ingest:${ipHash}`, max_count: 60, window_seconds: 60,
  });
  if (allowed !== true) return bad(429);

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
      return {
        type,
        path: clampStr(e.path, 120),
        referrer: clampStr(e.referrer, 500),
        props: sanitizeProps(e.props),
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
    p_device_key: deviceKey,
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
