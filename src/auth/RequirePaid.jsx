import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider.jsx';
import { useAuthGate } from './AuthGate.jsx';
import Paywall from '../components/Paywall.jsx';
import { beginTrialSession, canUseFreeTrial, freeTrialState } from '../lib/freeTrial.js';

/**
 * Wrap routes that require an active *paid* plan.
 *
 * Order of decisions, top to bottom (first match wins):
 *   1. Not signed in              → redirect to /login
 *   2. Signed in, paid            → render children
 *   3. Signed in, free, trial OK  → render children (consumes one session)
 *   4. Signed in, free, trial used → render <Paywall trialUsed />
 *
 * No survey gate here — the survey lives on /account as a non-blocking
 * card so it never interrupts a tracing session or risks dropping the
 * user's uploaded reference image.
 */
export default function RequirePaid({ children }) {
  const { user, profile, isPaid } = useAuth();
  const location = useLocation();
  const gate = useAuthGate();

  if (gate.element) return gate.element;

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Auth has settled but the profile row hasn't loaded. Bouncing to
  // /account routes the user into <ProfileRecover />, which has the
  // backoff retries + manual escape hatch. Without this, the !isPaid
  // branch below would fall through to <Paywall trialUsed={false} />,
  // which is misleading: the user isn't actually trial-used, the app
  // just couldn't fetch their plan yet. Re-rendering the universal
  // recover surface keeps the diagnostic story in one place.
  if (!profile) {
    return <Navigate to="/account" state={{ from: location.pathname }} replace />;
  }

  if (!isPaid) {
    // Free pass budget: a signed-in free user gets FREE_SESSION_LIMIT
    // tracing sessions before the paywall locks the studio. Each fresh
    // /trace visit burns one (consume_free_session RPC fires from
    // <Trace /> on mount).
    if (canUseFreeTrial(profile)) {
      // Lock in this tab as the active trial session BEFORE <Trace />
      // mounts and burns the count. Without this, the post-consume
      // profile-update re-render would see no session flag and — on the
      // user's last available session — flip the state to 'used',
      // kicking them back out of the studio they just entered.
      beginTrialSession();
      return children;
    }
    return <Paywall trialUsed={freeTrialState(profile) === 'used'} />;
  }

  return children;
}
