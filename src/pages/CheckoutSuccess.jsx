import { useNavigate } from 'react-router-dom';
import { hasPendingImage } from '../lib/pendingImage.js';

// Dodo redirects here after a successful payment. The webhook activates the
// subscription out-of-band — we don't gate the celebration on it landing,
// because making the user wait on a spinner is the bad UX they explicitly
// did not want. The realtime channel + AuthProvider polling will flip
// `isPaid` reactively whenever it lands.
export default function CheckoutSuccess() {
  const navigate = useNavigate();
  const dest = hasPendingImage() ? '/trace' : '/upload';

  const onStart = () => navigate(dest, { replace: true });

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
