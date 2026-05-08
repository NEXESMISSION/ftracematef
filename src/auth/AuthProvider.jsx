import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { endTrialSession } from '../lib/freeTrial.js';
import { currentPresence, onPresenceChange } from '../lib/presence.js';

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

  // Tracks the user id whose profile/subscription we've already fetched.
  // Used by settle() (in the auth effect below) to decide whether to flip
  // `loading` back to true before re-running loadUserData. Token refreshes
  // (same user.id) keep loading=false so consumers don't see a spinner
  // flash mid-session; genuine user changes (sign-in, sign-out, swap) set
  // loading=true so gates like RequireAuth / RequirePaid show the spinner
  // instead of briefly evaluating against the previous user's stale data.
  // The undefined sentinel (vs null) distinguishes "we've never loaded"
  // from "we've loaded the signed-out state".
  const fetchedForUidRef = useRef(undefined);

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
      const newUid = next?.user?.id ?? null;
      const needsLoad = fetchedForUidRef.current !== newUid;
      setSession(next);
      // Hand the realtime client the latest user JWT so authenticated
      // channels (broadcast+presence on tw:* / live:* in livePreview.js)
      // can subscribe successfully. Without this, on supabase-js >=2.45
      // the WebSocket connects with the anon key only, and any project
      // that has realtime authorization configured at all will silently
      // drop SUBSCRIBED → CHANNEL_ERROR. Symptom: AuthProvider's
      // postgres_changes channel works (uses RLS), but our broadcast
      // channels never wire up presence between two peers.
      // No-op if next is null (signed out) — pass empty string to clear.
      try {
        supabase.realtime.setAuth(next?.access_token ?? '');
      } catch (err) {
        console.warn('[AuthProvider] realtime.setAuth failed:', err);
      }
      // User changed — show the spinner while we refetch. Without this,
      // a fresh sign-in renders /account with session set but profile
      // still null, and the "We couldn't load your profile" screen
      // flashes for one frame before loadUserData resolves.
      if (needsLoad && mounted) setLoading(true);
      try {
        await loadUserData(next?.user?.id);
        fetchedForUidRef.current = newUid;
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

  // 2.5) Capture signup context (landing page + referrer) on first sign-in.
  // Fires once per profile, the first time we see a profile whose
  // signup_landing column is still null AND whose created_at is fresh
  // (< 60s old, so we don't retroactively stamp an existing user with the
  // page they happened to be on when they updated to this build).
  // Best-effort RPC: failures are silent — we'd rather miss a stamp than
  // block sign-in on a transient network blip.
  const stampedSignupRef = useRef(false);
  useEffect(() => {
    if (!profile || stampedSignupRef.current) return;
    if (profile.signup_landing) return;
    const created = profile.created_at ? new Date(profile.created_at).getTime() : 0;
    if (Date.now() - created > 60_000) return;
    stampedSignupRef.current = true;
    // Strip the auth callback's ?code= / #access_token= from the path so
    // the landing column is the route the user *intended*, not the OAuth
    // hand-off URL. The most useful signal is whether they landed on
    // /pricing vs /welcome vs / before signup, not the auth flow detail.
    const landing = (() => {
      try {
        const path = window.location.pathname.replace(/^\//, '') || 'root';
        if (path.startsWith('auth/callback')) {
          // OAuth round-trip — try sessionStorage marker the login UI sets.
          return window.sessionStorage.getItem('tm:signup-landing') || 'oauth';
        }
        return path.split('/')[0];
      } catch { return 'unknown'; }
    })();
    const referrer = (() => {
      try { return document.referrer || ''; } catch { return ''; }
    })();
    // Traffic-source attribution: read the first-touch slug stamped by
    // RefRedirect on /r/:source (or a pretty-alias route like /tiktok).
    // We DON'T clear these keys after reading — re-reading the same value
    // is harmless because the RPC is idempotent (only writes if the column
    // is still null), and keeping them around lets us debug an unstamped
    // signup ("did the link click happen at all?") from the user's browser.
    const { source, campaign } = (() => {
      try {
        return {
          source:   window.localStorage.getItem('tm:ref')          || '',
          campaign: window.localStorage.getItem('tm:ref-campaign') || '',
        };
      } catch { return { source: '', campaign: '' }; }
    })();
    // PostgrestBuilder is PromiseLike (only .then) — using .catch directly
    // throws "x.catch is not a function". Pass a no-op error handler as
    // the second .then argument instead. Same intent: silent on failure.
    supabase.rpc('record_signup_context', {
      p_landing:  landing.slice(0, 60),
      p_referrer: referrer.slice(0, 500),
      p_source:   source.slice(0, 32),
      p_campaign: campaign.slice(0, 60),
    }).then(() => {}, () => {});
  }, [profile]);

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

  // Cross-user state hygiene. Every per-user side store on the device
  // (trial session flag, pre-checkout snapshot, pending image, intent plan,
  // cached trace stats) gets wiped whenever the authenticated user-id
  // transitions from one value to another WITHOUT going through signOut().
  // Without this, a token swap (sibling-tab session change, signInWithIdToken,
  // an OAuth re-bind that doesn't fire SIGNED_OUT in between) would leave
  // user A's stale flags in place for user B — most visibly, B's freeTrial
  // state reads "active" because A's inMemoryFlag is still set.
  //
  // Skips the very first transition (null → first user-id) so we don't wipe
  // legitimately-pending state for the user who just signed in.
  const prevUserIdRef = useRef(null);
  useEffect(() => {
    const currentId = session?.user?.id ?? null;
    const prevId    = prevUserIdRef.current;
    prevUserIdRef.current = currentId;

    if (prevId && currentId && prevId !== currentId) {
      try {
        window.localStorage.removeItem(`tm:traceStats:${prevId}`);
        window.localStorage.removeItem('tm:traceStats:anon');
        window.sessionStorage.removeItem('tm:pending-image');
        window.sessionStorage.removeItem('tm:intent-plan');
        window.sessionStorage.removeItem('tm:checkout:before');
      } catch { /* ignore quota / private mode */ }
      endTrialSession();
    }
  }, [session?.user?.id]);

  // Presence heartbeat: stamp profiles.last_seen_at + current_page +
  // current_image_label every ~60s while the tab is visible. Powers the
  // "online now" green dot on the admin dashboard AND tells the operator
  // what page each user is on (and what image, when tracing).
  //
  // The page/image labels come from the lib/presence.js module-level
  // registry, populated by individual pages via the usePresence() hook.
  // We also subscribe to presence-change events so a route transition
  // surfaces in <60s on the dashboard instead of waiting for the next
  // tick.
  //
  // While in /trace, Trace.jsx runs its own heartbeat_trace_run() RPC
  // every ~30s which independently stamps the same fields plus keeps
  // the trace_session_runs row alive. The two streams stamp the same
  // values; last write wins, no inconsistency.
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
      //
      // Map module nulls to empty strings, NOT JSON null. The server's
      // touch_last_seen() treats null as "leave the column alone" and ''
      // as "explicitly clear it". After a tab-kill on /trace the server
      // still has page='trace' + image_label='puppy.jpg' from the last
      // heartbeat; on the user's next page load we want the very first
      // heartbeat to clear that stale state, not preserve it. Pages with
      // usePresence still send their declared page string, which then
      // overrides the empty.
      const { page, imageLabel } = currentPresence();
      try {
        await supabase.rpc('touch_last_seen', {
          p_page:  page  || '',
          p_image: imageLabel || '',
        });
      } catch { /* ignore */ }
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

    // Fire an immediate heartbeat whenever the user changes pages so the
    // dashboard reflects the new context within seconds rather than up
    // to a full HEARTBEAT_MS interval. Skip when the tab is hidden — no
    // point spending the round-trip on a backgrounded tab.
    const unsubPresence = onPresenceChange(() => {
      if (document.visibilityState === 'visible') ping();
    });

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisible);
      unsubPresence();
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
