import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import Landing from './Landing.jsx';

// Root route: signed-in users land on /account; everyone else sees the marketing site.
// While auth is resolving we render Landing too — it'll briefly flash for a returning
// user, but that beats showing a blank page or a spinner on a public marketing route.
export default function Home() {
  const { user, loading } = useAuth();
  if (loading) return <Landing />;
  if (user)    return <Navigate to="/account" replace />;
  return <Landing />;
}
