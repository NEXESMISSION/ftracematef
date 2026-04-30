import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider.jsx';
import { useAuthGate } from './AuthGate.jsx';

/** Wrap any protected route with this. Unauthed users get bounced to /login. */
export default function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const gate = useAuthGate();

  if (gate.element) return gate.element;

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
}
