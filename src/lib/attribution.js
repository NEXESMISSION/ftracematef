// Unified first-touch attribution store.
//
// Two independent dimensions, captured the moment a tagged link is clicked
// and read once on first sign-in (see AuthProvider):
//
//   1. Marketing SOURCE  — tracemate.art/r/:source, /tiktok, etc. Answers
//      "which channel sent this visitor?" (signup_source / signup_campaign).
//   2. Affiliate CODE    — tracemate.art/i/:code. Answers "which partner
//      referred this visitor?", and is what the commission system pays out on
//      (profiles.referred_by).
//
// WHY COOKIES *AND* localStorage:
//   The previous build stored attribution in localStorage only. In-app
//   browsers on TikTok / Instagram / Reddit / Facebook routinely partition
//   or wipe localStorage between the link tap and the eventual sign-up, so
//   the overwhelming majority of social clicks landed as "(direct / unknown)".
//   Cookies survive those cases far better (they're a separate store with an
//   explicit expiry and aren't cleared by the same partitioning rules), so we
//   write BOTH and read with a cookie→localStorage fallback. Whichever store
//   still has the value at sign-up time wins.
//
// FIRST-TOUCH: a value is only written if neither store already holds a
// non-expired one. A visitor who taps a TikTok link, leaves, and later taps a
// partner link stays attributed to TikTok / the first partner — matching the
// existing signup_source semantics and keeping attribution fraud-resistant.
//
// 90-day expiry so a months-old click doesn't retroactively attribute a
// brand-new signup from the same browser.

const TTL_MS = 90 * 24 * 60 * 60 * 1000;

// Storage keys (shared across cookie + localStorage so a value written by an
// older build to localStorage is still found).
const K = {
  source:      'tm:ref',
  campaign:    'tm:ref-campaign',
  sourceAt:    'tm:ref-at',
  affiliate:   'tm:aff',
  affiliateAt: 'tm:aff-at',
};

const SLUG_RE = /^[a-z0-9_-]+$/;

/** Lowercase, trim, length-cap, and validate a slug. Returns null if invalid. */
export function normalizeSlug(raw, max = 32) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase().slice(0, max);
  if (!cleaned || !SLUG_RE.test(cleaned)) return null;
  return cleaned;
}

/* ── cookie helpers ──────────────────────────────────────────────────────── */
// Cookies are written for the apex via the current host. SameSite=Lax is the
// right default — the link click is a top-level navigation, so the cookie is
// sent and readable; we never need it on cross-site subrequests. Secure is set
// on https so the cookie isn't exposed over plain http.

function setCookie(name, value, maxAgeMs) {
  if (typeof document === 'undefined') return;
  try {
    const secure = (typeof location !== 'undefined' && location.protocol === 'https:')
      ? '; Secure' : '';
    const maxAge = Math.floor(maxAgeMs / 1000);
    document.cookie =
      `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
  } catch { /* disabled cookies — silently skip */ }
}

function getCookie(name) {
  if (typeof document === 'undefined') return null;
  try {
    const prefix = `${name}=`;
    for (const part of document.cookie.split(';')) {
      const c = part.trim();
      if (c.startsWith(prefix)) return decodeURIComponent(c.slice(prefix.length));
    }
  } catch { /* ignore */ }
  return null;
}

function delCookie(name) {
  if (typeof document === 'undefined') return;
  try { document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`; }
  catch { /* ignore */ }
}

/* ── localStorage helpers (best-effort) ──────────────────────────────────── */

function lsGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function lsSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
}
function lsDel(key) {
  try { window.localStorage.removeItem(key); } catch { /* ignore */ }
}

/* ── generic read/write with cookie↔localStorage fallback ────────────────── */

// Read a value preferring localStorage (the legacy store, so older stamps
// keep working) and falling back to the cookie. Either hit is good enough.
function readValue(key) {
  return lsGet(key) ?? getCookie(key) ?? null;
}

// Has any non-expired value been stamped for this dimension? Checks the
// timestamp key against TTL in whichever store still has it.
function isStamped(valueKey, atKey) {
  const value = readValue(valueKey);
  if (!value) return false;
  const at = Number(readValue(atKey) || 0);
  if (!at) return true; // value present but no timestamp — treat as stamped
  return (Date.now() - at) <= TTL_MS;
}

function writeBoth(key, value, ttlMs) {
  lsSet(key, value);
  setCookie(key, value, ttlMs);
}
function clearBoth(key) {
  lsDel(key);
  delCookie(key);
}

/* ── public API ──────────────────────────────────────────────────────────── */

/**
 * First-touch stamp a marketing source (+ optional campaign sub-label).
 * No-op if a non-expired source is already stamped. Pass raw strings; they're
 * normalized + validated here.
 */
export function stampSource(rawSource, rawCampaign) {
  const source = normalizeSlug(rawSource, 32);
  if (!source) return;
  if (isStamped(K.source, K.sourceAt)) return;

  const campaign = normalizeSlug(rawCampaign, 32);
  writeBoth(K.source, source, TTL_MS);
  writeBoth(K.sourceAt, String(Date.now()), TTL_MS);
  if (campaign) writeBoth(K.campaign, campaign, TTL_MS);
  else clearBoth(K.campaign);
}

/**
 * First-touch stamp an affiliate referral code. No-op if a non-expired code
 * is already stamped.
 */
export function stampAffiliate(rawCode) {
  const code = normalizeSlug(rawCode, 32);
  if (!code) return;
  if (isStamped(K.affiliate, K.affiliateAt)) return;
  writeBoth(K.affiliate, code, TTL_MS);
  writeBoth(K.affiliateAt, String(Date.now()), TTL_MS);
}

/** Read the stamped marketing source + campaign (empty strings when absent). */
export function readSource() {
  return {
    source:   readValue(K.source) || '',
    campaign: readValue(K.campaign) || '',
  };
}

/** Read the stamped affiliate code (empty string when absent). */
export function readAffiliate() {
  return readValue(K.affiliate) || '';
}
