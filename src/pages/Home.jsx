import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import Landing from './Landing.jsx';

// Synchronously detect a persisted Supabase session so returning users don't
// see Landing flash before being redirected to /account.
function hasPersistedSession() {
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) return true;
    }
  } catch { /* private mode / disabled storage */ }
  return false;
}

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return hasPersistedSession()
      ? (
        <div className="auth-loading-screen">
          <span className="auth-loading-dot" />
        </div>
      )
      : <Landing />;
  }
  if (user) return <Navigate to="/account" replace />;
  return <Landing />;
}
