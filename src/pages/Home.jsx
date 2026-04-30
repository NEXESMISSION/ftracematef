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
//
// Security: we only forward PKCE-flow keys (`code`, `state`) and OAuth-spec
// error keys. Implicit-flow tokens (access_token / refresh_token / provider_*)
// are NEVER forwarded — those arrive in the URL hash, never reach the server,
// and re-emitting them as `?query=` would leak them into browser history,
// Referer headers, and any access log on the way to /auth/callback.
//
// Forwarding the raw search/hash would also let an attacker craft a link like
// `tracemate.art/?code=&error_description=<phishing-text>` that lands on the
// real domain showing whatever message they wrote — text-only, but still a
// credible phishing primitive on a trusted origin.
const ALLOWED_OAUTH_KEYS = new Set([
  'code',
  'state',
  'error',
  'error_description',
]);

function filterAllowed(rawSearchOrHash) {
  if (!rawSearchOrHash) return '';
  const stripped = rawSearchOrHash.replace(/^[?#]/, '');
  if (!stripped) return '';
  const out = new URLSearchParams();
  const seen = new URLSearchParams(stripped);
  for (const [k, v] of seen) {
    if (ALLOWED_OAUTH_KEYS.has(k)) out.append(k, v);
  }
  const s = out.toString();
  return s ? `?${s}` : '';
}

export default function Home() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  // We only auto-forward when there's a PKCE `code` or an OAuth `error`.
  // Implicit-flow `access_token` is intentionally ignored: we use PKCE
  // (see lib/supabase.js), so any `access_token` in the URL is either a
  // misconfiguration or a planted phishing link — better to render the
  // landing page and let Supabase's client decide what to do.
  const hasOAuthCode =
    params.has('code') ||
    hashParams.has('error') ||
    params.has('error');
  if (hasOAuthCode) {
    // Only safe keys, only from the search half. We deliberately do NOT
    // merge the hash (which would contain implicit-flow tokens). Hash
    // values stay in the fragment — the browser doesn't transmit them
    // anywhere we don't want them.
    const safeQuery = filterAllowed(location.search);
    return <Navigate to={`/auth/callback${safeQuery}`} replace />;
  }
  return <Landing />;
}
