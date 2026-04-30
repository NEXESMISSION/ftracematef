import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { hasPendingImage } from '../lib/pendingImage.js';

/**
 * Google sends users back here after consent (?code=…).
 * We wait for Supabase to settle the session, then route smartly:
 *   - has pending image + already paid → /trace (jump straight in — they
 *     uploaded and clicked "Start tracing" before signing in)
 *   - has pending image + not paid     → /pricing (mid-flow, needs to pay)
 *   - no pending image                 → /account (the default home for
 *     anyone who signed in directly without staging an image first)
 */
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let settled = false;

    const decideRoute = async () => {
      const hasImage = hasPendingImage();
      // Pull the freshest active subscription for the just-authed user.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return '/login';

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan, status, current_period_end')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      // Mirror the canonical isPaid logic from AuthProvider so we don't
      // optimistically route to /trace and then immediately get bounced
      // to a Paywall for a stricter check (with the 6h renewal grace).
      const RENEWAL_GRACE_MS = 6 * 60 * 60 * 1000;
      const isPaid = (() => {
        if (!sub) return false;
        if (sub.plan === 'free' || sub.status !== 'active') return false;
        if (sub.plan === 'lifetime') return true;
        if (!sub.current_period_end) return false;
        return new Date(sub.current_period_end).getTime() + RENEWAL_GRACE_MS > Date.now();
      })();

      // Pending-image flow: preserve the original "I uploaded, then I'll
      // sign in to trace it" intent.
      if (hasImage && isPaid)  return '/trace';
      if (hasImage && !isPaid) return '/pricing';

      // Plain sign-in: send everyone to their account page.
      return '/account';
    };

    const go = async (fallback) => {
      if (settled) return;
      settled = true;
      const dest = fallback || (await decideRoute());
      navigate(dest, { replace: true });
    };

    // Listener: fires the moment the PKCE exchange completes.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        go();
      }
    });

    // Eager check for already-cached sessions.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) go();
    });

    // Safety net: if neither path resolves in 8s, send to /login.
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
