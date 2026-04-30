import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

// Google sends users back here after consent (?code=…). We wait for Supabase
// to settle the session, then route everyone to /account. Keeps the
// post-auth landing simple and predictable: from /account the user can pick
// what to do next (open studio, upload, manage plan).
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let settled = false;

    const go = (dest = '/account') => {
      if (settled) return;
      settled = true;
      navigate(dest, { replace: true });
    };

    // Listener: fires the moment the PKCE exchange completes.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        go('/account');
      }
    });

    // Eager check for already-cached sessions.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) go('/account');
    });

    // Safety net: if neither path resolves in 8s, send to /login so the user
    // can retry instead of staring at a "Signing you in…" spinner forever.
    const timeout = setTimeout(() => go('/login'), 8000);

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
