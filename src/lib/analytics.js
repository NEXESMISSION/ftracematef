// Provider-agnostic analytics shim.
//
// Supports Plausible / Umami / GoatCounter via build-time env vars. If none
// is configured, every export is a no-op so the app runs fine without an
// analytics provider — pick one when you're ready.
//
// Env vars (set in .env.local before `npm run build`):
//
//   Plausible (paid, hosted)
//     VITE_PLAUSIBLE_DOMAIN     — e.g. tracemate.art
//     VITE_PLAUSIBLE_EMBED_URL  — full shared-dashboard URL with ?embed=true
//
//   Umami (free if self-hosted, or umami.is cloud)
//     VITE_UMAMI_WEBSITE_ID     — UUID from Umami dashboard
//     VITE_UMAMI_SCRIPT_URL     — defaults to https://cloud.umami.is/script.js
//     VITE_UMAMI_EMBED_URL      — public dashboard share URL
//
//   GoatCounter (free hosted on goatcounter.com, also self-hostable)
//     VITE_GOATCOUNTER_URL      — your site URL, e.g. https://yourname.goatcounter.com
//                                 (used for both the count endpoint AND the embed)
//
// CSP: public/_headers must allow the script + connect + frame origin for the
// chosen provider. Plausible / umami.is cloud / GoatCounter (gc.zgo.at +
// *.goatcounter.com) are allowlisted by default. Self-hosted Umami needs its
// own origin added there.

const PLAUSIBLE_DOMAIN = import.meta.env.VITE_PLAUSIBLE_DOMAIN;
const UMAMI_WEBSITE_ID = import.meta.env.VITE_UMAMI_WEBSITE_ID;
const UMAMI_SCRIPT_URL = import.meta.env.VITE_UMAMI_SCRIPT_URL || 'https://cloud.umami.is/script.js';
const GOATCOUNTER_URL  = import.meta.env.VITE_GOATCOUNTER_URL;

export const ANALYTICS_PROVIDER =
  PLAUSIBLE_DOMAIN ? 'plausible'   :
  UMAMI_WEBSITE_ID ? 'umami'       :
  GOATCOUNTER_URL  ? 'goatcounter' :
  null;

// GoatCounter's "embed" is just its public dashboard URL — no separate share
// link / auth token, but the operator must enable "Public statistics" in
// the GoatCounter site settings before the iframe will render anything.
export const ANALYTICS_EMBED_URL =
  import.meta.env.VITE_PLAUSIBLE_EMBED_URL ||
  import.meta.env.VITE_UMAMI_EMBED_URL ||
  GOATCOUNTER_URL ||
  null;

let initialized = false;

/**
 * Inject the tracking script once.
 * - Plausible + Umami auto-track SPA navigation since their v2 scripts.
 * - GoatCounter only counts the initial load by default; we suppress that
 *   and drive every pageview through trackPageview() so route changes work.
 */
export function initAnalytics() {
  if (initialized || ANALYTICS_PROVIDER === null) return;
  if (typeof document === 'undefined') return;
  initialized = true;

  if (ANALYTICS_PROVIDER === 'plausible') {
    const s = document.createElement('script');
    s.defer = true;
    s.setAttribute('data-domain', PLAUSIBLE_DOMAIN);
    s.src = 'https://plausible.io/js/script.js';
    document.head.appendChild(s);
    return;
  }

  if (ANALYTICS_PROVIDER === 'umami') {
    const s = document.createElement('script');
    s.defer = true;
    s.setAttribute('data-website-id', UMAMI_WEBSITE_ID);
    s.src = UMAMI_SCRIPT_URL;
    document.head.appendChild(s);
    return;
  }

  if (ANALYTICS_PROVIDER === 'goatcounter') {
    // Tell the GoatCounter script not to fire the initial pageview itself —
    // we'll handle every pageview (including the first) via trackPageview()
    // so route changes are counted consistently.
    window.goatcounter = { no_onload: true };
    const s = document.createElement('script');
    s.async = true;
    s.setAttribute('data-goatcounter', `${GOATCOUNTER_URL.replace(/\/$/, '')}/count`);
    s.src = 'https://gc.zgo.at/count.js';
    s.addEventListener('load', () => trackPageview());
    document.head.appendChild(s);
  }
}

/**
 * Report a pageview. No-op for Plausible/Umami (they auto-track pushState);
 * required for GoatCounter on every route change. Safe to call at any time
 * — silently no-ops before init or if the script hasn't loaded yet.
 */
export function trackPageview() {
  if (!initialized) return;
  if (ANALYTICS_PROVIDER !== 'goatcounter') return;
  try { window.goatcounter?.count?.(); } catch { /* ignore */ }
}
