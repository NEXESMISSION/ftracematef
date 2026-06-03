// First-party anonymous analytics SDK.
//
// Tracks EVERY visitor from first paint — no account required — and stitches
// their pre-signup history onto the account the moment they sign in. Pairs with
// the public `ingest-events` Edge Function (the only writer to analytics_*) and
// the `AnalyticsPulse` admin tab.
//
// Design:
//   * visitor_id — a uuid in localStorage. Stable across sessions/tabs; it's
//     the spine every event hangs off and what identify() links to a user.
//   * session_id — a uuid that rolls over after 30 min of inactivity (or a new
//     calendar day). The first event of a session carries props.session_start
//     so the server bumps the visitor's session counter exactly once.
//   * Events are queued in memory and flushed in batches via sendBeacon (with a
//     fetch keepalive fallback) on a 5s timer, on tab-hide, and on pagehide —
//     so we never block the UI and rarely lose the tail of a session.
//
// This is intentionally separate from lib/analytics.js (the optional 3rd-party
// Plausible/Umami shim). They can coexist; this one feeds OUR dashboard.

import { readSource, readAffiliate, stampSource } from './attribution.js';
import { supabase } from './supabase.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const INGEST_URL = SUPABASE_URL
  ? `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/ingest-events`
  : null;

const FLUSH_MS = 5000;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const MAX_QUEUE = 60; // mirror the server's MAX_EVENTS_PER_BATCH

const K = {
  vid: 'tm:vid',
  sid: 'tm:sid',
  sidAt: 'tm:sid-at',
  landing: 'tm:landing',
};

/* ── storage helpers (best-effort; never throw) ───────────────────────────── */
function lsGet(k) { try { return window.localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch { /* ignore */ } }

function uuid() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  // RFC4122-ish fallback for ancient in-app browsers without randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* ── identity ─────────────────────────────────────────────────────────────── */
// Cookie helpers so the visitor_id survives a localStorage clear (it doesn't
// survive incognito / a different browser — the server-side device_key handles
// those). 1-year first-party cookie, Lax + Secure on https.
function setVidCookie(v) {
  try {
    const secure = (typeof location !== 'undefined' && location.protocol === 'https:') ? '; Secure' : '';
    document.cookie = `${K.vid}=${encodeURIComponent(v)}; Max-Age=${365 * 24 * 60 * 60}; Path=/; SameSite=Lax${secure}`;
  } catch { /* ignore */ }
}
function getVidCookie() {
  try {
    const prefix = `${K.vid}=`;
    for (const part of document.cookie.split(';')) {
      const c = part.trim();
      if (c.startsWith(prefix)) return decodeURIComponent(c.slice(prefix.length));
    }
  } catch { /* ignore */ }
  return null;
}

function visitorId() {
  // Prefer whichever store still has it (localStorage OR cookie), then write
  // BOTH so a future clear of either one self-heals from the survivor.
  let v = lsGet(K.vid) || getVidCookie();
  if (!v) v = uuid();
  lsSet(K.vid, v);
  setVidCookie(v);
  return v;
}

// Return the current session id, rolling it over after 30 min idle. Returns
// `{ id, started }` where `started` is true only on the tick that minted a new
// session — the caller stamps props.session_start on that event.
function sessionId() {
  const now = Date.now();
  const last = Number(lsGet(K.sidAt) || 0);
  let id = lsGet(K.sid);
  let started = false;
  if (!id || !last || (now - last) > SESSION_IDLE_MS) {
    id = uuid();
    started = true;
    lsSet(K.sid, id);
  }
  lsSet(K.sidAt, String(now));
  return { id, started };
}

/* ── device fingerprint (coarse, non-identifying) ─────────────────────────── */
// A deliberately small UA parser. We only need coarse buckets for breakdowns
// (mobile/desktop, iOS/Android/Windows/macOS, Chrome/Safari/Firefox) — not the
// exact version, and certainly not a fingerprint.
function parseUA(ua) {
  const u = ua || '';
  const mobile = /Mobi|Android|iPhone|iPod/i.test(u);
  const tablet = /iPad|Tablet/i.test(u) || (/Android/i.test(u) && !/Mobi/i.test(u));
  const device_type = tablet ? 'tablet' : mobile ? 'mobile' : 'desktop';

  let os = 'other';
  if (/iPhone|iPad|iPod/i.test(u)) os = 'iOS';
  else if (/Android/i.test(u)) os = 'Android';
  else if (/Windows/i.test(u)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(u)) os = 'macOS';
  else if (/Linux/i.test(u)) os = 'Linux';
  else if (/CrOS/i.test(u)) os = 'ChromeOS';

  let browser = 'other';
  if (/Edg\//i.test(u)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(u)) browser = 'Opera';
  else if (/SamsungBrowser/i.test(u)) browser = 'Samsung';
  else if (/Firefox\//i.test(u)) browser = 'Firefox';
  else if (/Chrome\//i.test(u)) browser = 'Chrome';
  else if (/Safari\//i.test(u)) browser = 'Safari';

  return { device_type, os, browser };
}

function device() {
  if (typeof navigator === 'undefined') return {};
  const ua = navigator.userAgent || '';
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* ignore */ }
  return {
    ...parseUA(ua),
    ua,
    lang: navigator.language || '',
    tz,
    viewport_w: window.innerWidth || 0,
    viewport_h: window.innerHeight || 0,
    screen_w: window.screen?.width || 0,
    screen_h: window.screen?.height || 0,
  };
}

function firstTouch() {
  const { source, campaign } = readSource();
  let referrer = '';
  try { referrer = document.referrer || ''; } catch { /* ignore */ }
  let landing = lsGet(K.landing);
  if (!landing) {
    try { landing = location.pathname || '/'; } catch { landing = '/'; }
    lsSet(K.landing, landing);
  }
  return {
    source: source || null,
    campaign: campaign || null,
    affiliate: readAffiliate() || null,
    referrer,
    landing_path: landing,
  };
}

/* ── queue + flush ────────────────────────────────────────────────────────── */
let queue = [];
let timer = null;
let currentUserId = null;
let started = false;

/* ── PWA / install funnel ───────────────────────────────────────────────────
 * The whole install journey is tracked as `custom` events whose `props.name`
 * carries the step (the ingest endpoint whitelists `name`, drops everything
 * else — so the platform is baked into the name, e.g. pwa_pick_ios). Steps:
 *   pwa_standalone      — a load where the app is already running installed
 *   pwa_promo_open      — the account "Install app" floating button was tapped
 *   pwa_pick_ios|android— a platform was chosen in the promo popup
 *   pwa_prompt_available— the browser offered a native install prompt
 *   pwa_prompt_accepted — the user accepted the native prompt
 *   pwa_prompt_dismissed— the user dismissed the native prompt
 *   pwa_installed       — the appinstalled event fired
 * get_analytics_overview rolls these into overview.pwa for the Pulse dashboard.
 */
let deferredInstallPrompt = null;
const installListeners = new Set();
function notifyInstall() { for (const cb of installListeners) { try { cb(); } catch { /* ignore */ } } }

/** True when the page is running as an installed PWA (standalone display). */
export function isStandalone() {
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  } catch { return false; }
}

/** True when a native install prompt has been captured and can be fired. */
export function isInstallPromptAvailable() { return !!deferredInstallPrompt; }

/** Subscribe to install-availability changes. Returns an unsubscribe fn. */
export function onInstallAvailability(cb) {
  installListeners.add(cb);
  return () => installListeners.delete(cb);
}

/** Record an install-funnel step (see the name list above). */
export function trackInstall(name, props = {}) {
  enqueue('custom', { name, ...props });
}

/**
 * Fire the captured native install prompt (Android / desktop Chrome). Resolves
 * to 'accepted' | 'dismissed' | null (no prompt was available). Tracks the
 * outcome. Safe no-op on browsers (iOS Safari) that never expose a prompt.
 */
export async function promptInstall() {
  const dp = deferredInstallPrompt;
  if (!dp) return null;
  deferredInstallPrompt = null;
  notifyInstall();
  try {
    dp.prompt();
    const choice = await dp.userChoice;
    const outcome = choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
    trackInstall(outcome === 'accepted' ? 'pwa_prompt_accepted' : 'pwa_prompt_dismissed');
    flush();
    return outcome;
  } catch { return null; }
}

function enqueue(type, props = {}, path) {
  if (!INGEST_URL) return;
  const sess = sessionId();
  if (sess.started) props = { ...props, session_start: true };
  queue.push({
    type,
    path: path ?? (typeof location !== 'undefined' ? location.pathname : null),
    referrer: typeof document !== 'undefined' ? (document.referrer || '') : '',
    props,
    _sid: sess.id,
  });
  if (queue.length >= MAX_QUEUE) flush();
}

function flush() {
  if (!INGEST_URL || queue.length === 0) return;
  const batch = queue;
  queue = [];

  // All events in a flush share one session_id (the latest); session rollover
  // is rare enough mid-flush that grouping by the last id is acceptable and
  // keeps the payload a single batch.
  const sid = batch[batch.length - 1]._sid;
  const events = batch.map(({ _sid, ...e }) => e);

  // Note: we deliberately do NOT send user_id here. The anonymous→account
  // stitch is done server-side via the authenticated link_visitor RPC (see
  // identify), so the public ingest endpoint never trusts a client user id.
  const payload = JSON.stringify({
    visitor_id: visitorId(),
    session_id: sid,
    device: device(),
    first_touch: firstTouch(),
    events,
  });

  try {
    if (navigator.sendBeacon) {
      // text/plain (not application/json) keeps this a CORS "simple request"
      // so the beacon isn't dropped — beacons can't do a preflight, and the
      // Edge Function parses the body as JSON regardless of Content-Type.
      const blob = new Blob([payload], { type: 'text/plain;charset=UTF-8' });
      const okBeacon = navigator.sendBeacon(INGEST_URL, blob);
      if (okBeacon) return;
    }
  } catch { /* fall through to fetch */ }

  try {
    fetch(INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {});
  } catch { /* give up — analytics must never break the app */ }
}

/* ── public API ───────────────────────────────────────────────────────────── */

/** Wire up timers + lifecycle flush hooks. Idempotent. */
export function initTracking() {
  if (started || !INGEST_URL || typeof window === 'undefined') return;
  started = true;

  // First-touch UTM capture: a link like tracemate.art/?utm_source=newsletter
  // &utm_campaign=jan never hits the /r/:source route, so stamp it here. Uses
  // the same first-touch store as tagged links (no-op if a source is already
  // stamped), so utm traffic shows up in BOTH Pulse's source breakdown and the
  // signup_source attribution on any account they create.
  try {
    const q = new URLSearchParams(location.search);
    const utmSource = q.get('utm_source');
    if (utmSource) stampSource(utmSource, q.get('utm_campaign') || q.get('utm_medium'));
  } catch { /* ignore */ }

  timer = setInterval(flush, FLUSH_MS);

  // ── PWA / install funnel listeners ──
  // A load while already installed (counts distinct visitors server-side, so
  // re-emitting per load is harmless).
  try { if (isStandalone()) enqueue('custom', { name: 'pwa_standalone' }); } catch { /* ignore */ }
  // Capture the native prompt so the account "Install app" button can fire it
  // on demand instead of letting the browser's mini-infobar decide the timing.
  window.addEventListener('beforeinstallprompt', (e) => {
    try { e.preventDefault(); } catch { /* ignore */ }
    deferredInstallPrompt = e;
    enqueue('custom', { name: 'pwa_prompt_available' });
    notifyInstall();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    enqueue('custom', { name: 'pwa_installed' });
    notifyInstall();
    flush();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  // pagehide is the most reliable "tab is going away" signal on mobile Safari.
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
}

/** Record a pageview for the given (or current) path. */
export function trackPageview(path) {
  enqueue('pageview', {}, path);
}

/** Record an arbitrary interaction. type ∈ click|scroll|rage|section|custom. */
export function trackEvent(type, props = {}, path) {
  enqueue(type, props, path);
}

/**
 * Link the anonymous visitor to a signed-in user. Called from AuthProvider when
 * a session appears. The authoritative stitch goes through the AUTHENTICATED
 * link_visitor RPC (the user is derived from the JWT server-side via auth.uid()
 * — we never send a spoofable user_id to the public ingest endpoint). We also
 * enqueue a lightweight 'identify' marker for the event timeline.
 */
export function identify(userId) {
  if (!userId || userId === currentUserId) return;
  currentUserId = userId;
  enqueue('identify', {});
  flush();
  // Server-trusted stitch. supabase carries the user's JWT, so auth.uid() in
  // link_visitor resolves to this user. Fire-and-forget; analytics must never
  // break auth.
  try {
    supabase.rpc('link_visitor', { p_visitor_id: visitorId() }).then(() => {}, () => {});
  } catch { /* ignore */ }
}
