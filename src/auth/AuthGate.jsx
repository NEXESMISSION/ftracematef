import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider.jsx';

/**
 * Shared loading + stuck-loader UI used by both RequireAuth and RequirePaid.
 * Keeps the 8-second safety-net behaviour and "couldn't reach our servers"
 * fallback in one place so the two gates can't drift apart.
 *
 * Usage:
 *   const gate = useAuthGate();
 *   if (gate.element) return gate.element;     // still resolving / stuck
 *   if (!user) return <Navigate to="/login" />; // proceed with your own checks
 */
export function useAuthGate() {
  const { loading } = useAuth();
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setStuck(true), 8000);
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
    return {
      element: (
        <div className="auth-loading-screen">
          <p className="auth-loading-text">
            Couldn't reach our servers — check your connection.
          </p>
          <a href="/" className="profile-btn" style={{ marginTop: 14 }}>
            Back to home
          </a>
        </div>
      ),
    };
  }

  return { element: null };
}
