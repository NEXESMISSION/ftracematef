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
  //
  // No snapshot at all means we can't make this comparison safely. Don't
  // fall back to "trust isPaid" — that was the original bug, just hidden
  // behind the null branch. A user who lands here without a snapshot got
  // here through a non-checkout path (bookmarked URL, hard refresh that
  // ate the snapshot, browser back-button on a closed flow, expired stamp)
  // and we have no business celebrating their existing paid status as a
  // fresh purchase. Bounce them to /account where they can see their real
  // subscription state.
  const subscriptionChanged = (() => {
    if (!preCheckout) return false; // no snapshot — refuse to celebrate
    if (!subscription) return false;
    if (subscription.id !== preCheckout.sub_id) return true;
    if (subscription.updated_at !== preCheckout.updated_at) return true;
    return false;
  })();

  // Where do we send a user who came back without a confirmed new payment?
  // - If we have a snapshot AND they were paid before → /pricing?checkout=cancelled
  //   (familiar cancel-modal flow, doesn't imply they have access)
  // - If we have no snapshot at all → /account (they may or may not have
  //   access; the page shows it correctly, no false signals either way)
  const cancelDestination = preCheckout
    ? '/pricing?checkout=cancelled'
    : '/account';

  // Bounce-to-failure path. Four triggers:
  //   1. Explicit failure status on the URL.
  //   2. Verification timeout (no isPaid flip within 30s).
  //   3. We have a snapshot, user was already paid, nothing changed
  //      (their existing access is unchanged; the new payment didn't go
  //      through).
  //   4. No snapshot at all → unconditionally route to /account. We can't
  //      prove this checkout produced a payment, regardless of isPaid, so
  //      we don't celebrate AND we don't hang the spinner. /account renders
  //      the user's real subscription state (paid or not) without false
  //      signals either way.
  useEffect(() => {
    if (explicitFailure || timedOut) {
      navigate(cancelDestination, { replace: true });
      return;
    }
    if (!preCheckout) {
      // No-snapshot guard. We have no evidence *this* checkout produced
      // anything — could be a stale tab, a manually-typed URL, a refresh
      // that wiped the snapshot, the back button after the celebration.
      // Send them to /account where they can see their actual state.
      navigate('/account', { replace: true });
      return;
    }
    if (wasPaidBefore && subscriptionChanged === false) {
      navigate(cancelDestination, { replace: true });
    }
  }, [
    explicitFailure, timedOut, wasPaidBefore, subscriptionChanged,
    preCheckout, cancelDestination, navigate,
  ]);

  // Verification timeout — only arms while we're still waiting for a
  // confirmed new payment. With a snapshot present, that means
  // subscriptionChanged flipping true. Without a snapshot, the no-snapshot
  // guard above already routed away, so we don't re-arm here.
  useEffect(() => {
    if (explicitFailure) return;
    if (!preCheckout) return;                  // no-snapshot guard handles it
    if (isPaid && subscriptionChanged) return; // confirmed new payment
    const t = setTimeout(() => setTimedOut(true), VERIFY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [isPaid, subscriptionChanged, explicitFailure, preCheckout]);

  // Confirmed paid → /upload?welcome=1. Strict: we only fire when isPaid is
  // true AND the subscription row genuinely changed since pre-checkout. The
  // no-snapshot case is handled above (route to /account, no celebration).
  useEffect(() => {
    if (!isPaid) return;
    if (!subscriptionChanged) return;
    navigate('/upload?welcome=1', { replace: true });
  }, [isPaid, subscriptionChanged, navigate]);

  // If we already know the outcome, don't render the verifying modal at all
  // — the redirect effect above is about to fire on the next tick. Without
  // this short-circuit the modal flashes for one frame on the way out.
  const confirmedNew = isPaid && subscriptionChanged;
  const confirmedNothingChanged = wasPaidBefore && !subscriptionChanged;
  if (
    explicitFailure || timedOut || confirmedNew ||
    confirmedNothingChanged || !preCheckout
  ) return null;

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
