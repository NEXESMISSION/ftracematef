import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { startCheckout, markPreCheckout, clearPreCheckoutSnapshot } from '../lib/checkout.js';
import { friendlyError } from '../lib/errors.js';

/**
 * Shared checkout flow used by every plan-grid surface in the app:
 * landing-section <Pricing>, full-page <PricingPage>, and the trial-used
 * <Paywall> on /trace. They all share:
 *
 *   - lifetimeLeft live counter (lifetime_seats_left RPC)
 *   - busy/error state per plan id
 *   - markPreCheckout snapshot BEFORE the await on startCheckout (so a
 *     renewal webhook landing mid-await can't poison the comparison)
 *   - clearPreCheckoutSnapshot on failure (so a never-completed checkout
 *     doesn't contaminate the next /checkout/success visit)
 *
 * Caller-side concerns (auto-consume sessionStorage intent, unauth → /login,
 * different "stamp first view" RPC events) stay in the surface components —
 * each surface has its own funnel semantics.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.redirectUnauthedToLogin] When true (Pricing,
 *   PricingPage), unauthenticated users are routed to /login with the chosen
 *   plan stashed as intent. When false (Paywall — RequirePaid already gates),
 *   the choose call is no-op without a user.
 */
export function usePlanCheckout({ redirectUnauthedToLogin = true } = {}) {
  const { user, subscription } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy]                 = useState(null);
  const [error, setError]               = useState(null);
  const [lifetimeLeft, setLifetimeLeft] = useState(null);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('lifetime_seats_left').then(({ data, error }) => {
      if (!cancelled && !error && typeof data === 'number') setLifetimeLeft(data);
    });
    return () => { cancelled = true; };
  }, []);

  const choose = async (planId) => {
    setError(null);
    if (!user) {
      if (redirectUnauthedToLogin) {
        // Persist the chosen plan immediately. sessionStorage survives the
        // OAuth round-trip to Google (AuthCallback → /pricing then resumes
        // checkout from it); React Router's location.state does NOT — which is
        // why the choice was getting lost after login. Pass location.state too
        // as a belt-and-braces for any rare non-OAuth path.
        try { sessionStorage.setItem('tm:intent-plan', planId); } catch { /* ignore */ }
        navigate('/login', { state: { intent: { plan: planId } } });
      }
      return;
    }
    try {
      setBusy(planId);
      markPreCheckout(subscription, user?.id);
      const url = await startCheckout(planId);
      window.location.href = url;
    } catch (e) {
      clearPreCheckoutSnapshot();
      setBusy(null);
      setError(friendlyError(e, 'Could not start checkout.'));
    }
  };

  return {
    busy,
    error,
    lifetimeLeft,
    choose,
    dismissError: () => setError(null),
  };
}
