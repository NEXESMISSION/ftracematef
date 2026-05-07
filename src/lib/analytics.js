// Provider-agnostic analytics shim.
//
// Supports PostHog / Plausible / Umami / GoatCounter via build-time env vars.
// If none is configured, every export is a no-op so the app runs fine without
// an analytics provider — pick one when you're ready.
//
// Env vars (set in .env.local before `npm run build`):
//
//   PostHog (free up to 1M events/mo — gives per-visitor referrer, GeoIP
//   country, device, UTMs, funnels, and joins anonymous→signed-in)
//     VITE_POSTHOG_KEY          — project key, starts with phc_…
//     VITE_POSTHOG_HOST         — defaults to https://us.i.posthog.com
//                                 (use https://eu.i.posthog.com for EU)
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
// chosen provider. PostHog (us-assets.i.posthog.com + us.i.posthog.com),
// Plausible, umami.is cloud, and GoatCounter (gc.zgo.at + *.goatcounter.com)
// are allowlisted by default. Self-hosted Umami / EU PostHog need their own
// origins added there.

const POSTHOG_KEY      = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST     = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
const PLAUSIBLE_DOMAIN = import.meta.env.VITE_PLAUSIBLE_DOMAIN;
const UMAMI_WEBSITE_ID = import.meta.env.VITE_UMAMI_WEBSITE_ID;
const UMAMI_SCRIPT_URL = import.meta.env.VITE_UMAMI_SCRIPT_URL || 'https://cloud.umami.is/script.js';
const GOATCOUNTER_URL  = import.meta.env.VITE_GOATCOUNTER_URL;

export const ANALYTICS_PROVIDER =
  POSTHOG_KEY      ? 'posthog'     :
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
// Queue PostHog calls made before array.js loads — we replay them after init.
const posthogQueue = [];
let posthogReady = false;

function callPosthog(method, args) {
  if (ANALYTICS_PROVIDER !== 'posthog') return;
  if (!posthogReady) { posthogQueue.push([method, args]); return; }
  try { window.posthog?.[method]?.(...args); } catch { /* ignore */ }
}

/**
 * Inject the tracking script once.
 * - PostHog: load array.js, then init() with SPA-aware pageview capture.
 * - Plausible + Umami auto-track SPA navigation since their v2 scripts.
 * - GoatCounter only counts the initial load by default; we suppress that
 *   and drive every pageview through trackPageview() so route changes work.
 */
export function initAnalytics() {
  if (initialized || ANALYTICS_PROVIDER === null) return;
  if (typeof document === 'undefined') return;
  initialized = true;

  if (ANALYTICS_PROVIDER === 'posthog') {
    const host = POSTHOG_HOST.replace(/\/$/, '');
    // Derive the assets host from the api host so EU/self-hosted users get
    // the matching CDN automatically (us.i → us-assets.i, eu.i → eu-assets.i).
    const assetsHost = host.replace('//us.i.', '//us-assets.i.')
                           .replace('//eu.i.', '//eu-assets.i.');
    const s = document.createElement('script');
    s.async = true;
    s.src = `${assetsHost}/static/array.js`;
    s.addEventListener('load', () => {
      try {
        window.posthog.init(POSTHOG_KEY, {
          api_host: host,
          // 2025-05-24 preset enables history-change pageviews + dead-clicks
          // + autocaptured exceptions — matches the docs' recommended default.
          defaults: '2025-05-24',
          // Don't record sessions by default; the user can enable later in
          // PostHog's project settings if they want session replays.
          disable_session_recording: true,
          persistence: 'localStorage+cookie',
        });
        posthogReady = true;
        // Replay anything that fired before init resolved (e.g. an identify
        // call from AuthProvider on initial session load).
        for (const [method, args] of posthogQueue.splice(0)) {
          try { window.posthog?.[method]?.(...args); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    });
    document.head.appendChild(s);
    return;
  }

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
 * Report a pageview. No-op for Plausible/Umami/PostHog (they auto-track
 * pushState via SPA support); required for GoatCounter on every route change.
 * Safe to call at any time — silently no-ops before init or if the script
 * hasn't loaded yet.
 */
export function trackPageview() {
  if (!initialized) return;
  if (ANALYTICS_PROVIDER !== 'goatcounter') return;
  try { window.goatcounter?.count?.(); } catch { /* ignore */ }
}

/**
 * Tag the current visitor as a known user. Joins the anonymous pre-signup
 * trail (referrer, UTMs, country, device) to the registered account so you
 * can see funnels like "tiktok visit → signup → paid".
 *
 * Only PostHog supports this — other providers no-op silently.
 *   userId: stable id (Supabase user.id is perfect — never the email).
 *   traits: optional { email, plan, ... } stored as person properties.
 */
export function identifyUser(userId, traits = {}) {
  if (!userId) return;
  callPosthog('identify', [userId, traits]);
}

/**
 * Capture a custom event (e.g. 'trace_started', 'checkout_clicked').
 * PostHog only — other providers no-op.
 */
export function trackEvent(name, props = {}) {
  if (!name) return;
  callPosthog('capture', [name, props]);
}

/**
 * Forget the current visitor on sign-out so the next person on the same
 * device gets a fresh anonymous id and isn't merged with the previous user.
 */
export function resetUser() {
  callPosthog('reset', []);
}
