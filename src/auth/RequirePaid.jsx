import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider.jsx';
import { useAuthGate } from './AuthGate.jsx';
import Paywall from '../components/Paywall.jsx';

/**
 * Wrap routes that require an active *paid* plan.
 * - Not signed in       → redirect to /login
 * - Signed in but free  → render <Paywall /> in place
 * - Signed in and paid  → render children
 */
export default function RequirePaid({ children }) {
  const { user, isPaid } = useAuth();
  const location = useLocation();
  const gate = useAuthGate();

  if (gate.element) return gate.element;

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!isPaid) return <Paywall />;

  return children;
}
