import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider.jsx';
import { useAuthGate } from './AuthGate.jsx';
import Paywall from '../components/Paywall.jsx';
import ExitSurvey from '../components/ExitSurvey.jsx';
import { beginTrialSession, canUseFreeTrial, freeTrialState } from '../lib/freeTrial.js';

/**
 * Wrap routes that require an active *paid* plan.
 * - Not signed in              → redirect to /login
 * - Signed in, free, with an unused/active free trial → render children
 * - Signed in but free (trial used), no exit-survey yet → render <ExitSurvey />
 * - Signed in but free (trial used) → render <Paywall trialUsed /> in place
 * - Signed in and paid         → render children
 */
export default function RequirePaid({ children }) {
  const { user, profile, isPaid } = useAuth();
  const location = useLocation();
  const gate = useAuthGate();
  // Optimistic local override: the moment ExitSurvey successfully POSTs we
  // flip this to true so the paywall renders immediately, without waiting
  // for the realtime profile-update channel to deliver the new
  // exit_survey_at stamp. The refresh() inside ExitSurvey also runs, so the
  // server-side value catches up within a frame or two.
  const [surveyDoneLocal, setSurveyDoneLocal] = useState(false);

  if (gate.element) return gate.element;

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!isPaid) {
    // Free pass budget: a signed-in free user gets FREE_SESSION_LIMIT tracing
    // sessions before the paywall locks the studio. Each fresh /trace visit
    // burns one (consume_free_session RPC fires from <Trace /> on mount).
    if (canUseFreeTrial(profile)) {
      // Lock in this tab as the active trial session BEFORE <Trace /> mounts
      // and burns the count. Without this, the post-consume profile-update
      // re-render would see no session flag and — on the user's last
      // available session — flip the state to 'used', kicking them back out
      // of the studio they just entered.
      beginTrialSession();
      return children;
    }
    const trialIsUsed = freeTrialState(profile) === 'used';
    // One-shot exit survey before the paywall: only when the trial is
    // actually used (so users mid-session aren't surveyed) AND we haven't
    // already recorded an answer for this account.
    const surveyPending =
      trialIsUsed
      && profile
      && !profile.exit_survey_at
      && !surveyDoneLocal;
    if (surveyPending) {
      return <ExitSurvey onDone={() => setSurveyDoneLocal(true)} />;
    }
    return <Paywall trialUsed={trialIsUsed} />;
  }

  return children;
}
