import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

// Module-level dedup for the PKCE exchange. Survives anything component-scoped
// state would not: React StrictMode's setup→cleanup→setup cycle, Vite HMR
// swapping the module, accidental remounts. Keyed by `?code=` so a fresh
// sign-in attempt with a new code isn't blocked by a previous attempt's entry.
//
// Only the FIRST caller per code receives the promise and is responsible for
// handling success/failure. Subsequent callers get null and rely on the
// SIGNED_IN listener (success) or the safety-net timeout (failure). This
// prevents the same error from being logged twice and the same navigate
// firing twice from duplicate effect runs.
const inFlightExchanges = new Map();
function exchangeOnce(code) {
  if (inFlightExchanges.has(code)) return null;
  // exchangeCodeForSession takes the auth code itself, not a URL — it sends
  // whatever string we pass as `auth_code` in the POST body. Passing the full
  // URL produced "invalid flow state, no valid flow state found" because the
  // server couldn't match that string to a stored flow.
  const promise = supabase.auth.exchangeCodeForSession(code);
  inFlightExchanges.set(code, promise);
  return promise;
}

// Strip OAuth params from the URL so a refresh doesn't retry a dead code.
// We keep the path so the page stays at /auth/callback (the loader UI is
// fine to render briefly while the navigate fires).
function cleanOAuthParamsFromUrl() {
  try {
    if (window.location.search || window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  } catch { /* ignore — non-browser or sandboxed env */ }
}

// On exchange failure, wipe the PKCE state from localStorage so the next
// "Continue with Google" click starts from a guaranteed-clean slate. The
// most common cause of "invalid flow state" after a fresh-looking sign-in
// is a stale code_verifier left over from an earlier half-completed
// attempt — it can't match the current server-side flow_state's challenge
// hash, and the server rejects every retry until that key is gone.
async function purgeStalePkceState() {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch { /* ignore — best effort */ }
  try {
    // Belt-and-braces: signOut may not touch the PKCE-specific keys
    // (`sb-…-auth-token-code-verifier`). Walk localStorage and drop them
    // explicitly so the next sign-in starts with no orphaned verifier.
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key && key.includes('code-verifier')) {
        window.localStorage.removeItem(key);
      }
    }
  } catch { /* ignore — quota / private mode */ }
}

// Google sends users back here after consent (?code=…). We wait for Supabase
// to settle the session, then route everyone to /account. Keeps the
// post-auth landing simple and predictable: from /account the user can pick
// what to do next (open studio, upload, manage plan).
//
// Failure paths surface to /login with a `state.error` message so the user
// gets actionable feedback instead of a silent bounce. Three cases are
// distinguished:
//   1. Provider-side error: the redirect arrived with ?error=… from Google
//   2. Exchange-side error: ?code=… present but PKCE exchange failed (e.g.
//      mismatched code_verifier, expired state)
//   3. No code at all: user landed here directly without going through OAuth
//
// We perform the PKCE code exchange EXPLICITLY rather than relying on
// Supabase's `detectSessionInUrl` auto-detect. That auto-detect mode would
// race with Home.jsx's <Navigate to="/auth/callback"> forwarder when the
// provider lands on `/`: the SDK would consume the code on Home before the
// Navigate completed, leaving AuthCallback to time out on a session that
// already exists. Explicit exchange here is the single source of truth.
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let settled = false;

    const go = (dest, state) => {
      if (settled) return;
      settled = true;
      navigate(dest, { replace: true, state });
    };

    // 1. Provider-side error — Google (or Supabase) rejected the request
    //    before we ever got a code. Both `?error=` and `#error=` shapes are
    //    valid in OAuth; check both. Bail early with a readable message.
    const params = new URLSearchParams(window.location.search);
    const hash   = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const providerError =
      params.get('error_description') || params.get('error') ||
      hash.get('error_description')   || hash.get('error');
    if (providerError) {
      go('/login', { error: decodeURIComponent(providerError) });
      return;
    }

    const code = params.get('code') ?? hash.get('code');

    // Listener: covers the race where exchangeCodeForSession resolves and
    // emits SIGNED_IN before our `.then()` chain wires up the navigation.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        go('/account');
      }
    });

    // Eager check for already-cached sessions (e.g. user lands here after
    // already being signed in — refreshing the tab should not loop them
    // through the exchange again).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        go('/account');
        return;
      }
      // No existing session and no `?code=…` — the user shouldn't really be
      // here. Send them to /login with a generic message rather than
      // looping the safety-net timeout.
      if (!code) {
        go('/login');
        return;
      }
      // Have a code, no session yet — perform the explicit PKCE exchange.
      // exchangeOnce() returns null for duplicate effect runs; only the
      // originator handles the result so the error never logs twice.
      const promise = exchangeOnce(code);
      if (!promise) return;
      promise
        .then(async ({ error }) => {
          // Strip ?code=… from the URL whether or not the exchange succeeded
          // — it's burned either way, and leaving it in place would let a
          // refresh replay a dead code and produce the same error again.
          cleanOAuthParamsFromUrl();
          if (error) {
            console.error('[AuthCallback] exchangeCodeForSession failed:', error);
            await purgeStalePkceState();
            go('/login', { error: "We couldn't complete sign-in. Please try again." });
          }
          // On success the SIGNED_IN listener above handles navigation.
        })
        .catch(async (err) => {
          cleanOAuthParamsFromUrl();
          console.error('[AuthCallback] exchangeCodeForSession threw:', err);
          await purgeStalePkceState();
          go('/login', { error: "We couldn't complete sign-in. Please try again." });
        });
    });

    // Safety net: if no session arrives in 8s, route to /login. If we had a
    // ?code= in the URL, the PKCE exchange silently failed — tell the user.
    const timeout = setTimeout(() => {
      go('/login', code
        ? { error: "We couldn't complete sign-in. Please try again." }
        : undefined);
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  return (
    <div className="auth-loading-screen">
      <p className="auth-loading-text">Signing you in…</p>
      <span className="auth-loading-dot" />
    </div>
  );
}
