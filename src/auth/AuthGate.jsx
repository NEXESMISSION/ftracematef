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
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (!loading) {
      setStuck(false);
      return;
    }
    const t = setTimeout(() => setStuck(true), 12000);
    return () => clearTimeout(t);
  }, [loading]);

  if (loading && !stuck) {
    return {
      element: (
        <div className="auth-loading-screen">
          <span className="auth-loading-dot" />
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
