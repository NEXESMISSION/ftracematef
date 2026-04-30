import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { hasPendingImage } from '../lib/pendingImage.js';

/**
 * Where Dodo redirects the user after a successful payment.
 *
 * The webhook flips their subscription to active. AuthProvider's realtime
 * channel listens to `subscriptions` updates filtered to the current user
 * — so `isPaid` flips reactively the second the row lands.
 *
 * If the user had uploaded an image before paying, we send them to /trace
 * (the image is in sessionStorage). Otherwise → /upload.
 */
export default function CheckoutSuccess() {
  const { isPaid } = useAuth();
  const navigate = useNavigate();

  // Reactively redirect once the webhook flips the subscription to active.
  useEffect(() => {
    if (!isPaid) return;
    const dest = hasPendingImage() ? '/trace' : '/upload';
    const t = setTimeout(() => navigate(dest, { replace: true }), 1200);
    return () => clearTimeout(t);
  }, [isPaid, navigate]);

  // Hard fallback: realtime might be blocked by network.
  useEffect(() => {
    if (isPaid) return;
    const dest = hasPendingImage() ? '/trace' : '/upload';
    const t = setTimeout(() => navigate(dest, { replace: true }), 15000);
    return () => clearTimeout(t);
  }, [isPaid, navigate]);

  return (
    <div className="studio-shell">
      <main className="checkout-success">
        <span className="check-burst" aria-hidden="true">✦</span>
        <h1 className={isPaid ? 'success-headline pop' : 'success-headline'}>
          {isPaid ? "You're in! Welcome to Trace Mate." : 'Confirming your payment…'}
        </h1>
        <p className="lead">
          {isPaid
            ? hasPendingImage() ? 'Sending you to your trace.' : 'Sending you to the studio.'
            : "This usually takes a second. We're syncing with the payment provider."}
        </p>
        {!isPaid && (
          <p className="checkout-fallback">
            Stuck? <Link to={hasPendingImage() ? '/trace' : '/upload'}>Continue</Link> ·
            {' '}<Link to="/account">Check account</Link>
          </p>
        )}
      </main>
    </div>
  );
}
