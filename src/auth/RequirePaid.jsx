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
 *   1. Not signed in                  → redirect to /login
 *   2. Signed in, traced ≥1, no survey → render <ExitSurvey /> (post-trace gate)
 *   3. Signed in, paid                → render children
 *   4. Signed in, free, trial OK      → render children (consumes one session)
 *   5. Signed in, free, trial used    → render <Paywall trialUsed />
 *
 * The survey fires AFTER the user's first trace, not before — asking up
 * front is intrusive and blocks the very thing they came to do, while
 * asking once they've felt the win gets warmer, higher-quality answers.
 * We gate on trace_sessions >= 1 (server-incremented by start_trace_run on
 * every /trace mount, paid + free), so:
 *   - First /trace visit: trace_sessions is still 0 → no survey, straight
 *     into the studio; start_trace_run then bumps it to 1.
 *   - Second /trace visit onward: trace_sessions >= 1 → survey shows once.
 * The gate only ever records once per account (idempotent server-side) and
 * re-renders on every /trace visit until the user actually submits.
 */
export default function RequirePaid({ children }) {
  const { user, profile, isPaid } = useAuth();
  const location = useLocation();
  const gate = useAuthGate();
  // Optimistic local override: the moment ExitSurvey successfully POSTs
  // we flip this to true so the next render falls through to the real
  // destination, without waiting for the realtime profile-update channel
  // to deliver the new survey_completed_at stamp. The refresh() inside
  // ExitSurvey also runs, so the server-side value catches up within a
  // frame or two. Resets to false on every fresh mount of RequirePaid
  // (i.e. every navigation to /trace) so a returning user with no
  // recorded answer always sees the survey.
  const [surveyDoneLocal, setSurveyDoneLocal] = useState(false);

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

  // Post-trace survey gate — runs before the paid/free branch but only
  // after the user has traced at least once (trace_sessions >= 1), so a
  // first-timer never hits it on the way into their first trace. Required
  // (no skip path); the survey only stamps survey_completed_at on a real
  // submit and re-renders on every /trace visit until the user answers.
  const surveyPending =
    Number(profile.trace_sessions ?? 0) >= 1
    && !profile.survey_completed_at
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
