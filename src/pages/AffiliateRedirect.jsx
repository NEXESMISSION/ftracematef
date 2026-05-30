import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { stampAffiliate } from '../lib/attribution.js';

// Affiliate referral link handler — tracemate.art/i/:code.
//
// Distinct from /r/:source (marketing channel attribution): this is the link
// a partner shares, and it's what the commission system pays out on. The code
// is stamped FIRST-TOUCH to cookie + localStorage (see lib/attribution.js),
// read back on first sign-in by AuthProvider, and recorded against the new
// user's profile via the record_referral RPC. When that user later pays, the
// dodo-webhook books a commission row for the referrer.
//
// Bounces to '/' so the visitor lands on the marketing page with a clean URL.
export default function AffiliateRedirect() {
  const { code } = useParams();

  useEffect(() => {
    // Validation + first-touch guard live inside stampAffiliate.
    stampAffiliate(code ?? '');
  }, [code]);

  return <Navigate to="/" replace />;
}
