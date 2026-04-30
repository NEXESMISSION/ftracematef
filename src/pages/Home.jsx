import { Navigate, useLocation } from 'react-router-dom';
import Landing from './Landing.jsx';

// Root route always renders the marketing site. Signed-in users are NOT
// auto-redirected to /account — the Nav component on Landing handles
// "where do I go next" via account-aware buttons. Treating `/` as a
// dedicated landing surface means anyone (including paying customers
// linking to the homepage) sees the same marketing-first experience.
//
// Defensive exception: if Supabase's Redirect URL allowlist isn't set up
// for /auth/callback, the OAuth round-trip lands here with `?code=…` in
// the URL. Bounce those to /auth/callback so the existing post-auth
// router (which sends users to /account) takes over.
export default function Home() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const hasOAuthCode = params.has('code') || location.hash.includes('access_token=');
  if (hasOAuthCode) {
    return <Navigate to={`/auth/callback${location.search}${location.hash}`} replace />;
  }
  return <Landing />;
}
