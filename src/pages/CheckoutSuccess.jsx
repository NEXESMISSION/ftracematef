import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { hasPendingImage } from '../lib/pendingImage.js';

// Dodo redirects here after a successful payment. We DO NOT trust the URL
// alone — Dodo will sometimes hit return_url on failure too, and showing a
// celebration to someone who didn't pay is the worst possible outcome. We
// gate the celebration on `isPaid` (driven by the webhook + AuthProvider's
// realtime/poll). If the subscription doesn't activate within VERIFY_TIMEOUT,
// we treat it as a failed checkout and bounce to /pricing?checkout=cancelled.
//
// Visual goal: don't repeat the old "Confirming your payment…" full-page
// spinner. The verifying state is a small unobtrusive card that flips to
// the celebration the second `isPaid` becomes true.
const VERIFY_TIMEOUT_MS = 12000;

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

  const dest = hasPendingImage() ? '/trace' : '/upload';
  const onStart = () => navigate(dest, { replace: true });

  // Verifying state — small, unobtrusive
  if (!isPaid) {
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

  // Confirmed paid — celebrate.
  return (
    <div className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="cs-title">
      <div className="profile-modal-backdrop" />
      <div className="profile-modal-card co-modal">
        <div className="co-burst" aria-hidden="true">
          <span className="co-burst-mark">✦</span>
        </div>
        <h2 id="cs-title" className="co-title">You're in!</h2>
        <p className="co-sub">
          Welcome to Trace Mate. Your studio is unlocked — let's trace something.
        </p>
        <button type="button" className="co-cta" onClick={onStart} autoFocus>
          Start tracing →
        </button>
      </div>
    </div>
  );
}
