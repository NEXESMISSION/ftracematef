import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider.jsx';
import { useAuthGate } from './AuthGate.jsx';
import Paywall from '../components/Paywall.jsx';
import { beginTrialSession, canUseFreeTrial, freeTrialState } from '../lib/freeTrial.js';

/**
 * Wrap routes that require an active *paid* plan.
 * - Not signed in       → redirect to /login
 * - Signed in, free, with an unused/active free trial → render children
 * - Signed in but free (trial used) → render <Paywall trialUsed /> in place
 * - Signed in and paid  → render children
 */
export default function RequirePaid({ children }) {
  const { user, profile, isPaid } = useAuth();
  const location = useLocation();
  const gate = useAuthGate();

  if (gate.element) return gate.element;

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!isPaid) {
    // One free pass: a signed-in free user gets a single tracing session
    // before the paywall locks the studio. The trial flag is stamped inside
    // <Trace /> on first mount via the start_free_trial_if_unused RPC.
    if (canUseFreeTrial(profile)) {
      // Lock in this tab as the active trial session BEFORE <Trace /> mounts
      // and writes the DB stamp. Without this, the post-stamp profile-update
      // re-render would see no session flag and flip the state to 'used',
      // immediately kicking the user back out of the studio they just entered.
      beginTrialSession();
      return children;
    }
    return <Paywall trialUsed={freeTrialState(profile) === 'used'} />;
  }

  return children;
}
