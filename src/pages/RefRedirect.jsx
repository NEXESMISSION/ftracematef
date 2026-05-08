import { useEffect } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';

// Traffic-source attribution route handler.
//
// Used by every short marketing link we share — tracemate.art/r/tiktok,
// tracemate.art/tiktok, tracemate.art/reddit?c=video3, etc. The component
// reads the source slug from the URL, persists it to localStorage as a
// FIRST-TOUCH stamp (never overwritten on later visits), then bounces the
// browser to '/' so the visitor lands on the marketing page with a clean
// URL bar and the SPA's normal signed-in/out routing takes over.
//
// On first sign-in, AuthProvider reads tm:ref + tm:ref-campaign out of
// localStorage and includes them in the record_signup_context RPC call.
// That's the moment the source becomes attached to a user row in the DB.
//
// Why localStorage instead of just a query param on /welcome:
//   - the visitor might bounce around (read pricing, view gallery, leave,
//     come back via direct URL the next day) before they sign up. Without
//     persistence, only signups that happen in the very first session
//     immediately on the link click would get attributed.
//   - first-touch matches the existing signup_landing semantic — a user
//     who clicks a TikTok link, leaves, and later clicks a Reddit link
//     stays attributed to TikTok. That's the right call for a small
//     funnel where re-attribution would be noise, not signal.
//
// 90-day expiry on the stamp so a six-month-old link click doesn't
// retroactively get attributed when the same browser eventually signs up.
const REF_STORAGE_KEY      = 'tm:ref';
const CAMPAIGN_STORAGE_KEY = 'tm:ref-campaign';
const REF_TIMESTAMP_KEY    = 'tm:ref-at';
const REF_TTL_MS           = 90 * 24 * 60 * 60 * 1000;

const SLUG_RE = /^[a-z0-9_-]+$/;

function normalizeSlug(raw, max) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase().slice(0, max);
  if (!cleaned || !SLUG_RE.test(cleaned)) return null;
  return cleaned;
}

export default function RefRedirect({ source: explicitSource }) {
  const params   = useParams();
  const location = useLocation();

  // Source comes from either the :source param (/r/:source) or the prop
  // (pretty-alias routes like /tiktok pass source="tiktok" directly).
  const rawSource = explicitSource ?? params.source ?? '';
  const source    = normalizeSlug(rawSource, 32);

  // Optional campaign sub-label — ?c=video3, ?c=launch, etc. Useful for
  // splitting a single channel across multiple posts/ads without burning
  // a new top-level slug for each one.
  const rawCampaign = (() => {
    try { return new URLSearchParams(location.search).get('c') || ''; }
    catch { return ''; }
  })();
  const campaign = normalizeSlug(rawCampaign, 32);

  useEffect(() => {
    if (!source) return;
    try {
      // First-touch: don't overwrite an existing stamp (unless it's expired).
      const existing = window.localStorage.getItem(REF_STORAGE_KEY);
      const stampedAt = Number(window.localStorage.getItem(REF_TIMESTAMP_KEY) || 0);
      const expired = !stampedAt || (Date.now() - stampedAt) > REF_TTL_MS;
      if (!existing || expired) {
        window.localStorage.setItem(REF_STORAGE_KEY, source);
        window.localStorage.setItem(REF_TIMESTAMP_KEY, String(Date.now()));
        if (campaign) {
          window.localStorage.setItem(CAMPAIGN_STORAGE_KEY, campaign);
        } else {
          window.localStorage.removeItem(CAMPAIGN_STORAGE_KEY);
        }
      }
    } catch { /* private mode / disabled storage — silently skip */ }
  }, [source, campaign]);

  // Always bounce to '/' regardless of whether the slug was valid. An
  // invalid slug just means we didn't stamp anything — but we still want
  // the visitor to land on the marketing page rather than a 404.
  return <Navigate to="/" replace />;
}
