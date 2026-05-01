import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { endTrialSession } from '../lib/freeTrial.js';

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

    // Detect "ghost session" — token in localStorage references a user that
    // no longer exists in the DB (e.g., DB was wiped during testing, or the
    // user was deleted from auth.users). Without this check the app thinks
    // the user is signed in but every query returns empty.
    //
    // Strategy: getSession() reads localStorage WITHOUT contacting the server.
    // getUser() makes an API round-trip to /auth/v1/user which validates the
    // JWT against the live user record. If that fails, the session is stale.
    //
    // CRITICAL: only run this on INITIAL load — never on subsequent
    // onAuthStateChange events. After PKCE completion, the SDK fires SIGNED_IN
    // before the new token has fully propagated, and a concurrent getUser()
    // racing with the callback page's own getSession() can return a transient
    // 401 — we'd then wipe a session that was just minted. Subsequent events
    // come from explicit in-tab actions (sign-in, sign-out, refresh) and don't
    // need server-side ghost-checking.
    const validateOrClear = async (candidateSession) => {
      if (!candidateSession) return null;
      try {
        const { data: { user: verifiedUser }, error } = await supabase.auth.getUser();
        // Only treat as a definitive ghost when the response is unambiguous:
        // a user actually came back AND it didn't match the local session.
        // Previously this branch fired on ANY error from getUser() — including
        // transient 401s after an external redirect (Dodo checkout return,
        // OAuth round-trip), which would silently sign the user out and
        // bounce them to /login mid-flow. Trust the session by default; the
        // *true* ghost case (user deleted, DB wiped) self-corrects on the
        // next data fetch in loadUserData when the profile row turns up null.
        if (!error && verifiedUser && verifiedUser.id !== candidateSession.user?.id) {
          console.warn('[AuthProvider] session/user mismatch — clearing.');
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          try {
            const uid = candidateSession.user?.id;
            if (uid) window.localStorage.removeItem(`tm:traceStats:${uid}`);
            window.localStorage.removeItem('tm:traceStats:anon');
            window.sessionStorage.removeItem('tm:pending-image');
            window.sessionStorage.removeItem('tm:intent-plan');
            // Drop the pre-checkout snapshot too — otherwise the next user
            // who signs in on this device could land on /checkout/success
            // and have their subscription compared against the previous
            // user's stamp, falsely registering as "row changed".
            window.sessionStorage.removeItem('tm:checkout:before');
          } catch { /* ignore quota / private mode */ }
          endTrialSession();
          return null;
        }
        if (error) {
          console.warn('[AuthProvider] getUser returned an error — keeping session, will rely on next data fetch to detect a true ghost:', error);
        }
        return candidateSession;
      } catch (err) {
        // Network failure — keep the session and let the UI retry. Don't
        // sign people out just because the validation request blipped.
        console.warn('[AuthProvider] session validation failed (network?), keeping session:', err);
        return candidateSession;
      }
    };

    const settle = async (newSession, { validate = false } = {}) => {
      if (!mounted) return;
      const next = validate ? await validateOrClear(newSession) : newSession;
      if (!mounted) return;
      setSession(next);
      try {
        await loadUserData(next?.user?.id);
      } catch (err) {
        // loadUserData already handles its own errors, but belt-and-braces.
        console.error('[AuthProvider] settle failed:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    // 1) initial session (handles existing session OR ?code= on /auth/callback).
    //    Only this path runs the ghost-session check — see comment above.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => settle(session, { validate: true }))
      .catch((err) => {
        console.error('[AuthProvider] getSession failed:', err);
        if (mounted) setLoading(false);
      });

    // 2) subscribe to future changes (sign-in, sign-out, token refresh, etc.)
    //    No re-validation: events come from in-tab actions we already trust.
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
  //
  //    Polling uses exponential backoff (4s → 8s → ... up to 60s) and stops
  //    entirely after 15 minutes of inactivity. Without these caps a tab on a
  //    network that always blocks WebSocket would hit /rest/v1/profiles and
  //    /rest/v1/subscriptions every 4s forever per tab — a self-inflicted DoS
  //    on the project's REST quota.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    const POLL_MIN_MS  = 4_000;
    const POLL_MAX_MS  = 60_000;
    const IDLE_STOP_MS = 15 * 60_000;

    let channel;
    let pollTimer = null;
    let pollDelay = POLL_MIN_MS;
    let pollStartedAt = 0;
    let connected = false;

    const stopPolling = () => {
      if (pollTimer != null) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    };
    const tick = async () => {
      pollTimer = null;
      if (Date.now() - pollStartedAt >= IDLE_STOP_MS) {
        // Give up: the user can refresh the tab to retry. Avoids infinite
        // polling on a tab that's been backgrounded for hours.
        return;
      }
      try { await loadUserData(userId); } catch { /* loadUserData logs */ }
      // Exponential backoff up to a cap. Reset to MIN whenever realtime
      // reconnects (handled in the SUBSCRIBED branch below).
      pollDelay = Math.min(pollDelay * 2, POLL_MAX_MS);
      pollTimer = setTimeout(tick, pollDelay);
    };
    const startPolling = () => {
      if (pollTimer != null) return;
      pollStartedAt = Date.now();
      pollDelay = POLL_MIN_MS;
      pollTimer = setTimeout(tick, pollDelay);
    };

    // If the user comes back to a tab that's been polling for a while, give
    // it one fresh attempt at min cadence — they probably want their state
    // up-to-date NOW, not after the back-off settles.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && pollTimer != null) {
        stopPolling();
        startPolling();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

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
      document.removeEventListener('visibilitychange', onVisible);
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* ignore */ }
      }
    };
  }, [session?.user?.id, loadUserData]);

  // Presence heartbeat: stamp profiles.last_seen_at every ~60s while the tab
  // is visible. Powers the "online now" green dot on the admin dashboard.
  // Cheap (one RPC, no payload) and bounded — we stop on hidden tabs so a
  // backgrounded tab doesn't keep counting as "online" forever.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    const HEARTBEAT_MS = 60_000;
    let timer = null;

    const ping = async () => {
      // Fire-and-forget. Network/RLS errors are non-fatal — presence is a
      // nice-to-have, not a correctness signal. The supabase builder is
      // thenable but not a real Promise, so we await it inside try/catch
      // rather than chaining .catch (which doesn't exist on the builder).
      try { await supabase.rpc('touch_last_seen'); } catch { /* ignore */ }
    };
    const start = () => {
      if (timer != null) return;
      ping();
      timer = setInterval(ping, HEARTBEAT_MS);
    };
    const stop = () => {
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session?.user?.id]);

  const signOut = useCallback(async () => {
    // Clear per-user state on the device before tearing down auth so the next
    // signed-in user (or the same user on a shared machine) doesn't see leftovers.
    try {
      const uid = session?.user?.id;
      if (uid) window.localStorage.removeItem(`tm:traceStats:${uid}`);
      // Also wipe the legacy anon bucket from older builds (see traceStats.js)
      // so it can't leak into the next user on a shared device.
      window.localStorage.removeItem('tm:traceStats:anon');
      // Also clear pending-image / pending-intent so a checkout-in-progress
      // doesn't get attributed to whoever signs in next.
      window.sessionStorage.removeItem('tm:pending-image');
      window.sessionStorage.removeItem('tm:intent-plan');
      // And the pre-checkout snapshot — see the matching cleanup in the
      // ghost-session path. A stale snapshot from a previous user would
      // make the next user's /checkout/success think their row "changed"
      // and falsely celebrate.
      window.sessionStorage.removeItem('tm:checkout:before');
    } catch { /* ignore quota / private mode */ }
    // End any live free-trial session in this tab so the next signed-in
    // user doesn't inherit it. The DB stamp is per-account so it's already
    // isolated, but the in-tab flag would otherwise leak across users.
    endTrialSession();
    // Global sign-out tries to invalidate refresh tokens server-side AND
    // wipe local storage. If the network call fails, the local-storage wipe
    // can be skipped — leaving the JWT readable to any later XSS. Catch the
    // global error and *always* run a local-only sign-out as the safety net,
    // so the device is clean regardless of network state.
    try {
      const { error } = await supabase.auth.signOut();
      if (error) console.warn('[AuthProvider] global signOut failed, falling back to local:', error);
    } catch (err) {
      console.warn('[AuthProvider] global signOut threw, falling back to local:', err);
    }
    // Belt-and-braces: scope:'local' is idempotent — calling it after a
    // successful global sign-out is a no-op, but if global failed, this
    // guarantees the token is purged from localStorage.
    try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
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
  //
  // Hardening notes:
  //  - We grant a 6-hour grace past `current_period_end` so a slightly
  //    delayed `subscription.renewed` webhook doesn't paywall a paying
  //    customer. Trade-off: a cancellation can over-grant up to 6h.
  //  - Exception: if the user has explicitly chosen "cancel at period end",
  //    no grace — we trust the explicit user intent over the convenience of
  //    masking webhook delay. Otherwise the rate-limit-loop on cancel/uncancel
  //    can be exploited for an extra 6 h of access.
  //  - Recurring plans with no `current_period_end` fail CLOSED. Previously
  //    this fail-open path could grant infinite access if a webhook ever
  //    stored bad data; that's strictly worse than a paywall.
  const RENEWAL_GRACE_MS = 6 * 60 * 60 * 1000;
  const isPaid = (() => {
    if (!subscription) return false;
    if (subscription.plan === 'free' || subscription.status !== 'active') return false;
    if (subscription.plan === 'lifetime') return true;
    const end = subscription.current_period_end;
    if (!end) return false; // recurring plan with no end date — refuse rather than fail open
    const endMs = new Date(end).getTime();
    if (subscription.cancel_at_next_billing_date) {
      return endMs > Date.now();
    }
    return endMs + RENEWAL_GRACE_MS > Date.now();
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
