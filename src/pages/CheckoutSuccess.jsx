import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { consumePreCheckoutSnapshot } from '../lib/checkout.js';

// Dodo redirects here after a successful payment. We DO NOT trust the URL
// alone — Dodo will sometimes hit return_url on failure too, and showing a
// celebration to someone who didn't pay is the worst possible outcome. We
// gate "paid confirmed" on `isPaid` (driven by the webhook + AuthProvider's
// realtime/poll). If the subscription doesn't activate within VERIFY_TIMEOUT,
// we treat it as a failed checkout and bounce to /pricing?checkout=cancelled.
//
// Behavioural change: this page no longer renders the celebration itself.
// Once payment is confirmed we replace history with /upload?welcome=1, and
// the celebration popup is rendered there (so the user lands directly on
// the page where they actually pick an image to trace).
//
// 30s, not 12s: under load the webhook can take 15-20s to land. Bouncing to
// "cancelled" too early after a real charge tempts the user to retry and
// gets them double-charged.
//
// "Already paid before we got here" handling: an upgrade/downgrade attempt
// that fails or is cancelled returns the user here with isPaid still TRUE
// (their existing subscription is unaffected). Without the snapshot below,
// we'd celebrate the user as if they'd just paid and route them to /upload.
// markPreCheckout() in lib/checkout.js stamps a "before" snapshot of the
// active subscription; on return we only treat isPaid=true as a fresh
// purchase if the row genuinely changed since then.
const VERIFY_TIMEOUT_MS = 30000;

export default function CheckoutSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isPaid, subscription } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  // Snapshot of the user's subscription state from immediately before the
  // redirect to Dodo. Read once on mount and dropped from sessionStorage so
  // a refresh of /checkout/success can't replay a stale comparison.
  const preCheckout = useMemo(() => consumePreCheckoutSnapshot(), []);
  const wasPaidBefore =
    preCheckout?.status === 'active' &&
    preCheckout?.plan && preCheckout.plan !== 'free';

  // Some payment providers pass an explicit failure status on the return_url.
  // If we ever see one we trust it immediately and skip the verification wait.
  // We check several common parameter names — Dodo and other PSPs aren't
  // perfectly consistent.
  const explicitFailure = (() => {
    const candidates = [
      searchParams.get('status'),
      searchParams.get('payment_status'),
      searchParams.get('checkout_status'),
      searchParams.get('result'),
    ].map((v) => (v || '').toLowerCase());
    const fail = ['failed', 'failure', 'cancelled', 'canceled', 'declined', 'error'];
    return candidates.some((v) => fail.includes(v)) || !!searchParams.get('error');
  })();

  // Compare the live subscription against the pre-checkout snapshot to decide
  // whether THIS checkout produced a real new payment. The webhook either
  // (a) updates the existing active row in place — bumps updated_at — or
  // (b) inserts a new row and cancels the old — id changes. Either case
  // means money moved; same id + same updated_at means nothing happened.
  const subscriptionChanged = (() => {
    if (!preCheckout) return null; // no snapshot — fall back to legacy behavior
    if (!subscription) return false;
    if (subscription.id !== preCheckout.sub_id) return true;
    if (subscription.updated_at !== preCheckout.updated_at) return true;
    return false;
  })();

  // Bounce-to-failure path. Adds: was-already-paid AND nothing changed →
  // user came back without a new charge → /pricing?checkout=cancelled.
  useEffect(() => {
    if (explicitFailure || timedOut) {
      navigate('/pricing?checkout=cancelled', { replace: true });
      return;
    }
    if (wasPaidBefore && subscriptionChanged === false) {
      navigate('/pricing?checkout=cancelled', { replace: true });
    }
  }, [explicitFailure, timedOut, wasPaidBefore, subscriptionChanged, navigate]);

  // Verification timeout — only arms while we're still waiting (not paid yet,
  // OR paid-before-but-waiting-for-the-row-to-update from this checkout).
  useEffect(() => {
    if (explicitFailure) return;
    if (isPaid && subscriptionChanged === true) return; // confirmed
    if (isPaid && subscriptionChanged === null) return; // legacy: no snapshot, trust isPaid
    const t = setTimeout(() => setTimedOut(true), VERIFY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [isPaid, subscriptionChanged, explicitFailure]);

  // Confirmed paid → /upload?welcome=1. We only fire when:
  //  - isPaid is true, AND
  //  - the subscription row actually changed since pre-checkout (genuine
  //    new payment), OR there was no snapshot at all (legacy callers /
  //    direct nav — fall back to old behavior).
  useEffect(() => {
    if (!isPaid) return;
    if (subscriptionChanged === false) return; // wasPaidBefore handler already routed
    navigate('/upload?welcome=1', { replace: true });
  }, [isPaid, subscriptionChanged, navigate]);

  // If we already know the outcome, don't render the verifying modal at all
  // — the redirect effect above is about to fire on the next tick. Without
  // this short-circuit the modal flashes for one frame on the way out.
  const confirmedNew = isPaid && subscriptionChanged !== false;
  const confirmedNothingChanged = wasPaidBefore && subscriptionChanged === false;
  if (explicitFailure || timedOut || confirmedNew || confirmedNothingChanged) return null;

  // Verifying state — small, unobtrusive card while the webhook lands.
  return (
    <div className="profile-modal" role="status" aria-live="polite">
      <div className="profile-modal-backdrop" />
      <div className="profile-modal-card co-modal co-modal-verify">
        <span className="co-spinner" aria-hidden="true" />
        <p className="co-verify-text">Confirming your payment…</p>
      </div>
    </div>
  );
}
