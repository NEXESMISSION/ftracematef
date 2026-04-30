import { Navigate } from 'react-router-dom';
import { hasPendingImage } from '../lib/pendingImage.js';

// Dodo redirects here after a successful payment. The webhook activates the
// subscription out-of-band; AuthProvider's realtime channel flips `isPaid`
// reactively, so we don't need a "Confirming your payment…" screen — just
// send the user straight to where they were headed.
export default function CheckoutSuccess() {
  const dest = hasPendingImage() ? '/trace' : '/upload';
  return <Navigate to={dest} replace />;
}
