import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';

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
const VERIFY_TIMEOUT_MS = 30000;

export default function CheckoutSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isPaid } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  // Some payment providers pass an explicit failure status on the return_url.
  // If we ever see one we trust it immediately and skip the verification wait.
  const explicitFailure = (() => {
    const status = (searchParams.get('status') || '').toLowerCase();
    return ['failed', 'failure', 'cancelled', 'canceled', 'declined'].includes(status);
  })();

  // Bounce-to-failure path
  useEffect(() => {
    if (explicitFailure || timedOut) {
      navigate('/pricing?checkout=cancelled', { replace: true });
    }
  }, [explicitFailure, timedOut, navigate]);

  // Verification timeout — only arms while we're still waiting (not paid yet).
  useEffect(() => {
    if (isPaid || explicitFailure) return;
    const t = setTimeout(() => setTimedOut(true), VERIFY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [isPaid, explicitFailure]);

  // Confirmed paid → replace into /upload with the welcome flag, so the
  // celebration popup shows on the upload page itself. `replace: true` keeps
  // the back button from sending users back to a stale "Confirming…" screen.
  useEffect(() => {
    if (isPaid) {
      navigate('/upload?welcome=1', { replace: true });
    }
  }, [isPaid, navigate]);

  // If we already know the outcome, don't render the verifying modal at all
  // — the redirect effect above is about to fire on the next tick. Without
  // this short-circuit the modal flashes for one frame on the way out.
  if (explicitFailure || timedOut || isPaid) return null;

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
