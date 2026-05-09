import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider.jsx';
import { useAuthGate } from './AuthGate.jsx';
import Paywall from '../components/Paywall.jsx';
import ExitSurvey from '../components/ExitSurvey.jsx';
import { beginTrialSession, canUseFreeTrial, freeTrialState } from '../lib/freeTrial.js';

/**
 * Wrap routes that require an active *paid* plan.
 *
 * Order of decisions, top to bottom (first match wins):
 *   1. Not signed in                → redirect to /login
 *   2. Signed in, no survey on file → render <ExitSurvey /> (universal gate)
 *   3. Signed in, paid              → render children
 *   4. Signed in, free, trial OK    → render children (consumes one session)
 *   5. Signed in, free, trial used  → render <Paywall trialUsed />
 *
 * The survey is universal by design — every user takes it the first time
 * they hit /trace, regardless of plan or trial state. Rationale:
 *   - First-time free user: answers BEFORE their first trace, then the
 *     trial flow continues and they enter the studio with their image.
 *   - Returning free user (trial used): answers BEFORE the paywall.
 *   - Paid user who paid before the survey existed: answers the next
 *     time they hit /trace, then continues straight into the studio.
 * The data point is more valuable than the friction it adds, and the
 * gate only ever fires once per account (idempotent server-side).
 */
export default function RequirePaid({ children }) {
  const { user, profile, isPaid } = useAuth();
  const location = useLocation();
  const gate = useAuthGate();
  // Optimistic local override: the moment ExitSurvey successfully POSTs
  // we flip this to true so the next render falls through to the real
  // destination, without waiting for the realtime profile-update channel
  // to deliver the new exit_survey_at stamp. The refresh() inside
  // ExitSurvey also runs, so the server-side value catches up within a
  // frame or two. Resets to false on every fresh mount of RequirePaid
  // (i.e. every navigation to /trace) so a returning user with no
  // recorded answer always sees the survey.
  const [surveyDoneLocal, setSurveyDoneLocal] = useState(false);

  if (gate.element) return gate.element;

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Universal survey gate — runs before the paid/free branch so every
  // user (paid + first-time free + trial-used free) hits it once. Required
  // (no skip path); the survey only stamps exit_survey_at on a real submit
  // and re-renders on every /trace visit until the user actually answers.
  const surveyPending =
    profile
    && !profile.exit_survey_at
    && !surveyDoneLocal;
  if (surveyPending) {
    return <ExitSurvey onDone={() => setSurveyDoneLocal(true)} />;
  }

  if (!isPaid) {
    // Free pass budget: a signed-in free user gets FREE_SESSION_LIMIT
    // tracing sessions before the paywall locks the studio. Each fresh
    // /trace visit burns one (consume_free_session RPC fires from
    // <Trace /> on mount). Survey is already done by the time we reach
    // this branch, so the user flows directly into the studio.
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
