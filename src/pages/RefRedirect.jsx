import { useEffect } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { stampSource } from '../lib/attribution.js';

// Traffic-source attribution route handler.
//
// Used by every short marketing link we share — tracemate.art/r/tiktok,
// tracemate.art/tiktok, tracemate.art/reddit?c=video3, etc. The component
// reads the source slug from the URL, persists it as a FIRST-TOUCH stamp
// (never overwritten on later visits) to BOTH a cookie and localStorage via
// lib/attribution.js, then bounces the browser to '/' so the visitor lands on
// the marketing page with a clean URL bar and the SPA's normal signed-in/out
// routing takes over.
//
// On first sign-in, AuthProvider reads the stamp back out (cookie→localStorage
// fallback) and includes it in the record_signup_context RPC call. That's the
// moment the source becomes attached to a user row in the DB.
//
// Why persist instead of just a query param on /welcome: the visitor might
// bounce around (read pricing, view gallery, leave, come back the next day)
// before they sign up. Without persistence, only signups in the very first
// session immediately on the click would get attributed. Cookies additionally
// survive the in-app-browser localStorage partitioning that lost most social
// clicks before — see the lib/attribution.js header.
export default function RefRedirect({ source: explicitSource }) {
  const params   = useParams();
  const location = useLocation();

  // Source comes from either the :source param (/r/:source) or the prop
  // (pretty-alias routes like /tiktok pass source="tiktok" directly).
  const rawSource = explicitSource ?? params.source ?? '';

  // Optional campaign sub-label — ?c=video3, ?c=launch, etc. Useful for
  // splitting a single channel across multiple posts/ads without burning
  // a new top-level slug for each one.
  const rawCampaign = (() => {
    try { return new URLSearchParams(location.search).get('c') || ''; }
    catch { return ''; }
  })();

  useEffect(() => {
    // First-touch stamp (cookie + localStorage). Validation + the
    // don't-overwrite-existing rule live inside stampSource.
    stampSource(rawSource, rawCampaign);
  }, [rawSource, rawCampaign]);

  // Always bounce to '/' regardless of whether the slug was valid. An
  // invalid slug just means we didn't stamp anything — but we still want
  // the visitor to land on the marketing page rather than a 404.
  return <Navigate to="/" replace />;
}
