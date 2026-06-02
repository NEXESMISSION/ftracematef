import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider.jsx';

/**
 * Shared loading + stuck-loader UI used by both RequireAuth and RequirePaid.
 *
 * Behaviour:
 *  - Initial load: render a small unobtrusive spinner.
 *  - After 12 seconds still loading: redirect to /login. We treat "auth never
 *    settled" the same as "auth failed" — surface a usable login screen
 *    instead of a stuck error page that the user can't act on. The login
 *    page then handles re-establishing the session (Google OAuth round-trip
 *    or PKCE callback).
 *  - The original location is passed via state so /login can bounce them
 *    back where they were once they sign in again.
 *
 * Usage:
 *   const gate = useAuthGate();
 *   if (gate.element) return gate.element;     // still resolving / redirecting
 *   if (!user) return <Navigate to="/login" />; // proceed with your own checks
 */
export function useAuthGate() {
  const { loading } = useAuth();
  const location = useLocation();
  const [slow, setSlow] = useState(false);   // ~9s: show a reassurance message
  const [stuck, setStuck] = useState(false); // ~20s: give up and bounce to /login

  useEffect(() => {
    if (!loading) {
      setSlow(false);
      setStuck(false);
      return;
    }
    // Two-stage: a slow network shouldn't eject a user mid-flow. We first show
    // a "taking longer than usual" note (so the screen isn't a silent spinner),
    // and only redirect to /login after a generous 20s — matching AuthCallback.
    const slowT = setTimeout(() => setSlow(true), 9000);
    const stuckT = setTimeout(() => setStuck(true), 20000);
    return () => { clearTimeout(slowT); clearTimeout(stuckT); };
  }, [loading]);

  if (loading && !stuck) {
    return {
      element: (
        <div className="auth-loading-screen">
          <span className="auth-loading-dot" />
          {slow && (
            <p className="auth-loading-note" role="status">
              Taking longer than usual — hang tight…
            </p>
          )}
        </div>
      ),
    };
  }

  if (loading && stuck) {
    // Auth never settled — bounce to login rather than stranding the user
    // on an error page. Pass the original location so /login can return
    // them after a successful sign-in.
    return {
      element: <Navigate to="/login" state={{ from: location.pathname }} replace />,
    };
  }

  return { element: null };
}
