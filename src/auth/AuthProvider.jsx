import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

/**
 * AuthProvider exposes `{ user, profile, subscription, isPaid, loading, signOut, refresh }`
 * to the whole app via the `useAuth()` hook.
 *
 * - profile and subscription rows are fetched in parallel after the session loads.
 * - subscription is the one row with status = 'active' (RLS already restricts to self).
 * - isPaid is the convenience flag for paywalls.
 *
 * Robustness: every async call that can throw (network error, missing tables,
 * RLS rejection) is caught so `loading` is *guaranteed* to flip to false. We'd
 * rather show the user a paywall they can't action than a permanent loader.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession]           = useState(null);
  const [profile, setProfile]           = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading]           = useState(true);

  // Returns true on success, false on error (so callers can decide).
  const loadUserData = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      setSubscription(null);
      return true;
    }
    try {
      const [profileRes, subRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'active')
          .maybeSingle(),
      ]);

      // Postgrest errors come back on the result object, not as throws.
      if (profileRes.error) {
        console.error('[AuthProvider] profiles query error:', profileRes.error);
      }
      if (subRes.error) {
        console.error('[AuthProvider] subscriptions query error:', subRes.error);
      }

      setProfile(profileRes.data ?? null);
      setSubscription(subRes.data ?? null);
      return !profileRes.error && !subRes.error;
    } catch (err) {
      console.error('[AuthProvider] loadUserData failed:', err);
      setProfile(null);
      setSubscription(null);
      return false;
    }
  }, []);

  // Initial session + onAuthStateChange handler.
  // Both wrap loadUserData in their own try/finally so we *always* clear `loading`.
  useEffect(() => {
    let mounted = true;

    const settle = async (newSession) => {
      if (!mounted) return;
      setSession(newSession);
      try {
        await loadUserData(newSession?.user?.id);
      } catch (err) {
        // loadUserData already handles its own errors, but belt-and-braces.
        console.error('[AuthProvider] settle failed:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    // 1) initial session (handles existing session OR ?code= on /auth/callback)
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => settle(session))
      .catch((err) => {
        console.error('[AuthProvider] getSession failed:', err);
        if (mounted) setLoading(false);
      });

    // 2) subscribe to future changes (sign-in, sign-out, token refresh, etc.)
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        // Don't await — fire-and-forget so the listener returns quickly.
        settle(newSession);
      }
    );

    return () => {
      mounted = false;
      authSub.unsubscribe();
    };
  }, [loadUserData]);

  // 3) Real-time: when the webhook flips this user's subscription, refresh.
  //    Falls back to lightweight polling if the realtime channel never reaches
  //    SUBSCRIBED (corp firewalls, ad-blockers, blocked WebSocket transport).
  //    Without the fallback, users behind such networks sit on /checkout/success
  //    indefinitely waiting for an event they can't receive.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    let channel;
    let pollTimer = null;
    let connected = false;

    const startPolling = () => {
      if (pollTimer != null) return;
      pollTimer = setInterval(() => loadUserData(userId), 4000);
    };
    const stopPolling = () => {
      if (pollTimer != null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    try {
      channel = supabase
        .channel(`subs:${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${userId}` },
          () => loadUserData(userId),
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            connected = true;
            stopPolling();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            connected = false;
            startPolling();
          }
        });
    } catch (err) {
      console.warn('[AuthProvider] realtime subscribe failed, falling back to polling:', err);
      startPolling();
    }

    // Safety net: if no SUBSCRIBED status fires within 5s, start polling
    // anyway. Realtime never errors out cleanly on every blocked network.
    const safety = setTimeout(() => { if (!connected) startPolling(); }, 5000);

    return () => {
      clearTimeout(safety);
      stopPolling();
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
      }
    };
  }, [session?.user?.id, loadUserData]);

  const signOut = useCallback(async () => {
    // Clear per-user state on the device before tearing down auth so the next
    // signed-in user (or the same user on a shared machine) doesn't see leftovers.
    try {
      const uid = session?.user?.id;
      if (uid) window.localStorage.removeItem(`tm:traceStats:${uid}`);
      // Also clear pending-image / pending-intent so a checkout-in-progress
      // doesn't get attributed to whoever signs in next.
      window.sessionStorage.removeItem('tm:pending-image');
      window.sessionStorage.removeItem('tm:intent-plan');
    } catch { /* ignore quota / private mode */ }
    await supabase.auth.signOut();
    // Hard-replace so we land on /login fresh, history is clean, and any
    // protected page that was rendered behind the user can't be back-buttoned to.
    window.location.replace('/login');
  }, [session?.user?.id]);

  const refresh = useCallback(
    () => loadUserData(session?.user?.id),
    [session, loadUserData]
  );

  // Lifetime never has a period_end. Recurring plans must still be inside
  // their billing window — a missed `subscription.expired` webhook shouldn't
  // grant infinite free access if the row stays 'active' past its end date.
  const isPaid = (() => {
    if (!subscription) return false;
    if (subscription.plan === 'free' || subscription.status !== 'active') return false;
    if (subscription.plan === 'lifetime') return true;
    const end = subscription.current_period_end;
    if (!end) return true; // missing period end on a recurring plan — fail open here
    return new Date(end).getTime() > Date.now();
  })();

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    subscription,
    isPaid,
    loading,
    signOut,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
