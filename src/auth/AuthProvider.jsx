import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { endTrialSession } from '../lib/freeTrial.js';
import { currentPresence, onPresenceChange } from '../lib/presence.js';
import { readSource, readAffiliate } from '../lib/attribution.js';

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

  // One-session-per-user enforcement. The local sid is the per-device,
  // per-user random uuid this tab claimed via claim_session() at sign-in.
  // When loadUserData (or the realtime profile-update subscription below)
  // observes profiles.current_session_id != localSessionIdRef.current, a
  // NEWER device claimed the account — kick this device.
  // Hydrated from localStorage on app reload so the comparison still works
  // after a refresh. localStorage layout: { uid, sid }.
  const localSessionIdRef = useRef(null);
  const supersededRef     = useRef(false); // guards re-entry when we sign out
  // We self-heal the FIRST session-id mismatch by re-stamping the DB with our
  // own sid (covers the sign-in claim race: getSession + onAuthStateChange can
  // both call claim_session, leaving the DB sid != this device's local sid and
  // false-triggering a "superseded" kick on the next reload). Only the first
  // mismatch is self-reclaimed; a genuine second device re-claims again, and
  // that second mismatch falls through to confirm-and-sign-out. Reset on every
  // fresh sign-in so later real takeovers are still detected.
  const reclaimedRef      = useRef(false);

  const forceSignOutSuperseded = useCallback(async () => {
    if (supersededRef.current) return;
    supersededRef.current = true;
    console.warn('[AuthProvider] session superseded by another device — signing out.');
    try { window.localStorage.removeItem('tm:session-id'); } catch { /* ignore */ }
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
    // Hard reload to /login so any rendered protected page is wiped.
    window.location.replace('/login');
  }, []);

  // Confirm-before-kick. The raw "remoteSid != localSid" check fired far too
  // eagerly: a page refresh, a second tab re-claiming, the realtime profile
  // stream racing our own claim_session write, or any transient stale read
  // would briefly show a session id that isn't ours and log the user out "for
  // no reason". A GENUINE new-device takeover, by contrast, leaves a different
  // sid in the DB permanently. So instead of kicking on the first mismatch, we
  // wait a beat and re-read: only if the foreign sid is STILL there do we sign
  // out. One pending confirmation at a time (the timer ref guards re-entry).
  const confirmTimerRef = useRef(null);
  const confirmSupersededThenSignOut = useCallback((userId) => {
    if (supersededRef.current || confirmTimerRef.current) return;
    confirmTimerRef.current = setTimeout(async () => {
      confirmTimerRef.current = null;
      if (supersededRef.current) return;
      const mySid = localSessionIdRef.current;
      if (!userId || !mySid) return; // signed out / no claim — nothing to enforce
      try {
        const { data, error } = await supabase
          .from('profiles').select('current_session_id').eq('id', userId).maybeSingle();
        if (error || !data) return;                 // can't confirm → never kick
        const remote = data.current_session_id ?? null;
        if (remote && remote !== mySid) {
          forceSignOutSuperseded();                 // confirmed takeover
        }
      } catch { /* network blip → don't kick */ }
    }, 2500);
  }, [forceSignOutSuperseded]);

  // Returns true on success, false on error (so callers can decide).
  const loadUserData = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      setSubscription(null);
      return true;
    }
    try {
      let [profileRes, subRes] = await Promise.all([
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

      // Self-heal a missing profile row. The "We couldn't load your profile"
      // screen used to render any time the SELECT didn't return a row —
      // whether the row was genuinely missing (signup-trigger failed,
      // row deleted) or the SELECT itself errored (transient RLS blip,
      // network glitch, stale cache).
      //
      // Recovery (transparent to the user) — three cooperating loops:
      //   1. SELECT retry  (300/700/1500ms)         — absorbs read-after-
      //      write replication lag and the slow path of the signup
      //      trigger committing on an under-resourced project.
      //   2. ensure_profile() RPC, retried 2x       — security-definer;
      //      bypasses RLS, creates the row from auth.users metadata.
      //      Idempotent. Fires for BOTH the empty-result and error
      //      branches, since either case means we lack data to render
      //      the studio and the RPC's worst case is a no-op SELECT.
      //   3. Final SELECT after a successful heal   — proves the row is
      //      now visible to the caller's session, in case PostgREST's
      //      schema cache lagged the RPC return value.
      //
      // Empirically the dead-end "couldn't load your profile" screen
      // always cleared on a manual refresh — i.e. the second AuthProvider
      // mount succeeded where the first failed. That's a transient race,
      // not a structural problem; the retries below close that window.
      const SELECT_DELAYS = [300, 700, 1500];
      for (const delay of SELECT_DELAYS) {
        if (profileRes.data) break;
        await new Promise((r) => setTimeout(r, delay));
        profileRes = await supabase
          .from('profiles').select('*').eq('id', userId).maybeSingle();
        if (profileRes.error) {
          console.warn(`[AuthProvider] profile retry (after ${delay}ms) errored:`, profileRes.error);
        }
      }

      if (!profileRes.data) {
        // Two attempts at the heal RPC with a small gap. Most failures
        // here are PostgREST schema cache lag (404 on a freshly-deployed
        // function) or a transient 503 on the auth.users read inside
        // the SECURITY DEFINER body — both retry-able.
        //
        // Permanent failures we DON'T retry:
        //   - errcode P0002 from ensure_profile = "auth user not found"
        //     (ghost session — JWT outlived its auth.users row). Force
        //     a local sign-out so the next page load starts clean
        //     instead of looping the 30 s recover screen.
        //   - PostgREST PGRST202 = function not found. Migration drift;
        //     no point retrying, log loudly and bail.
        let permanentFailure = null;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          if (profileRes.data) break;
          console.warn(`[AuthProvider] profile fetch did not return a row, calling ensure_profile RPC (attempt ${attempt})`, {
            had_error: !!profileRes.error,
          });
          const heal = await supabase.rpc('ensure_profile');
          if (heal.error) {
            console.error(`[AuthProvider] ensure_profile RPC failed (attempt ${attempt}):`, heal.error);
            const code = heal.error.code;
            // Postgres P0002 = no_data_found, raised by ensure_profile()
            // when auth.users has no row for this uid. PostgREST surfaces
            // this with code "P0002" or sometimes "23503" if the FK trip
            // happens at the INSERT layer.
            if (code === 'P0002' || code === '23503' || /auth user .* not found/i.test(heal.error.message ?? '')) {
              permanentFailure = 'ghost-session';
              break;
            }
            // PGRST202 = "Could not find the function in the schema cache".
            // Means the migration adding ensure_profile() hasn't been
            // pushed to this project. Retrying won't help.
            if (code === 'PGRST202') {
              permanentFailure = 'rpc-missing';
              break;
            }
            if (attempt < 2) await new Promise((r) => setTimeout(r, 800));
            continue;
          }
          if (heal.data) {
            // PostgREST may wrap a single-composite return as an array — handle both.
            const row = Array.isArray(heal.data) ? heal.data[0] : heal.data;
            // Reject null-record returns. The hardened ensure_profile()
            // RAISES instead of returning a null record, but older
            // deploys without the migration applied could still send
            // back { id: null, email: null, ... } — treat it as a
            // failure so we don't store fake profile state.
            if (row && row.id) {
              profileRes = { data: row, error: null };
              // The RPC also makes sure a free subscription exists. Refetch
              // it so the UI sees the freshly-created row instead of null.
              if (!subRes.data) {
                subRes = await supabase
                  .from('subscriptions').select('*')
                  .eq('user_id', userId).eq('status', 'active').maybeSingle();
              }
              break;
            } else if (row) {
              console.warn('[AuthProvider] ensure_profile returned a null-record (likely pre-harden migration) — ignoring');
            }
          }
        }

        if (permanentFailure === 'ghost-session') {
          // The JWT references a deleted user. Wipe local auth and
          // bounce — the user will land on /login and can sign in
          // fresh. Without this they'd sit on the recover screen
          // burning a network round-trip every couple of seconds
          // until they eventually reload manually.
          console.warn('[AuthProvider] ghost session detected — forcing local sign-out');
          try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
          setProfile(null);
          setSubscription(null);
          return false;
        }
        if (permanentFailure === 'rpc-missing') {
          console.error('[AuthProvider] ensure_profile RPC is missing — the harden migration has not been applied to this project');
          // Fall through to set state to null; the user will see the
          // recover screen with manual buttons. Nothing more we can do
          // from the client.
        }

        // Last-ditch: even if the RPC didn't hand us a row directly, the
        // INSERT it ran is committed — re-SELECT one more time. Some
        // PostgREST builds drop the composite-row return value silently
        // when search_path resolution misses a recently-added column,
        // but the row IS in the table.
        if (!profileRes.data && !permanentFailure) {
          await new Promise((r) => setTimeout(r, 400));
          profileRes = await supabase
            .from('profiles').select('*').eq('id', userId).maybeSingle();
          if (profileRes.data) {
            console.info('[AuthProvider] post-heal SELECT recovered the profile row');
          }
        }
      }

      // Single-session check. Only fires when:
      //   - The DB knows about a session (column non-null — pre-migration
      //     rows are skipped).
      //   - We have a local sid for THIS user (otherwise we have no claim
      //     to lose; mismatch on a freshly-rehydrated tab without sid is
      //     not enough evidence to kick).
      //   - The two values disagree.
      const remoteSid = profileRes.data?.current_session_id ?? null;
      const localSid  = localSessionIdRef.current;
      if (remoteSid && localSid && remoteSid !== localSid) {
        if (!reclaimedRef.current) {
          // First mismatch. Most often this is our OWN device: the sign-in
          // claim race (two claim_session calls) or a stale read left the DB
          // holding a sid that isn't the one we minted. Re-stamp the DB with
          // our sid ONCE and don't kick — the realtime UPDATE this produces
          // re-runs loadUserData, which should now match (race healed). If it
          // was instead a genuine takeover, the other device re-claims and the
          // NEXT mismatch (reclaimedRef already true) signs us out below.
          reclaimedRef.current = true;
          supabase.rpc('claim_session', { p_session_id: localSid }).then(() => {}, () => {});
        } else {
          // Second mismatch after we already reclaimed → a real other device
          // is fighting for the account. Confirm (re-read in ~2.5s) then kick.
          confirmSupersededThenSignOut(userId);
        }
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
  }, [forceSignOutSuperseded, confirmSupersededThenSignOut]);

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
      // channels (broadcast+presence on live:* in livePreview.js) can
      // subscribe successfully. Without this, on supabase-js >=2.45
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
      // Single-session enforcement.
      //   - Signed-out (newUid null): drop the local sid; nothing to
      //     enforce.
      //   - Signed in for a user we'd already loaded (token refresh,
      //     same-tab navigation): keep whatever sid is in the ref;
      //     re-hydrate from localStorage on first run if needed.
      //   - Fresh sign-in / sign-up (newUid changed and is non-null):
      //     mint a brand new sid, persist locally, and call
      //     claim_session() so the DB stamps it as the canonical session.
      //     Any older device's sid stops matching — its realtime sub
      //     fires and signs it out.
      if (!newUid) {
        localSessionIdRef.current = null;
        reclaimedRef.current = false;
        try { window.localStorage.removeItem('tm:session-id'); } catch { /* ignore */ }
      } else {
        // Hydrate first. If localStorage already has a sid for this uid,
        // it means we've previously claimed on this device — a page
        // reload, a token refresh, or another tab in the same browser.
        // We must NOT re-mint in those cases: re-minting + re-claiming
        // would race other tabs of the same browser, and a stale loadUser
        // pass would see a sid that doesn't match the DB and incorrectly
        // sign the user out. Reuse the cached sid; the DB still has it.
        let cachedSid = null;
        try {
          const cached = JSON.parse(window.localStorage.getItem('tm:session-id') ?? 'null');
          if (cached?.uid === newUid && typeof cached?.sid === 'string') {
            cachedSid = cached.sid;
          }
        } catch { /* ignore */ }

        if (cachedSid) {
          localSessionIdRef.current = cachedSid;
          // Don't claim — already claimed. If another device has since
          // overwritten current_session_id, loadUserData will detect the
          // mismatch and kick this device, which is the intended outcome.
        } else if (needsLoad) {
          // Genuine fresh sign-in / sign-up on this device — no prior sid
          // for this uid. Mint, persist, claim. The await ensures the DB
          // is stamped before loadUserData reads it (otherwise we'd race
          // a previous device's stamp and false-trigger the mismatch).
          const sid = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : (Math.random().toString(36).slice(2) + Date.now().toString(36));
          localSessionIdRef.current = sid;
          // Fresh owner on this device — allow one self-heal again, and let a
          // genuinely later takeover still be detected.
          reclaimedRef.current = false;
          try {
            window.localStorage.setItem('tm:session-id', JSON.stringify({ uid: newUid, sid }));
          } catch { /* ignore */ }
          try {
            await supabase.rpc('claim_session', { p_session_id: sid });
          } catch (err) {
            // Best-effort. If the column doesn't exist yet (pre-migration),
            // RPC errors out; the DB-side check just silently no-ops the
            // single-session feature. Don't block sign-in on it.
            console.warn('[AuthProvider] claim_session failed:', err);
          }
        }
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
    // RefRedirect on /r/:source (or a pretty-alias route like /tiktok),
    // now from cookie OR localStorage (whichever survived the in-app
    // browser — see lib/attribution.js). We DON'T clear these after reading:
    // re-reading the same value is harmless because the RPC is idempotent
    // (only writes if the column is still null), and keeping them around
    // lets us debug an unstamped signup from the user's browser.
    const { source, campaign } = readSource();
    // PostgrestBuilder is PromiseLike (only .then) — using .catch directly
    // throws "x.catch is not a function". Pass a no-op error handler as
    // the second .then argument instead. Same intent: silent on failure.
    supabase.rpc('record_signup_context', {
      p_landing:  landing.slice(0, 60),
      p_referrer: referrer.slice(0, 500),
      p_source:   source.slice(0, 32),
      p_campaign: campaign.slice(0, 60),
    }).then(() => {}, () => {});

    // Affiliate referral attribution: if this browser clicked a partner's
    // /i/:code link before signing up, stamp the new profile with that
    // referrer so the dodo-webhook can pay commission on their purchases.
    // First-touch + idempotent server-side (only writes if referred_by is
    // still null), so a no-op for organic signups.
    const affiliate = readAffiliate();
    if (affiliate) {
      supabase.rpc('record_referral', { p_code: affiliate.slice(0, 32) })
        .then(() => {}, () => {});
    }
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
    // Debounce for the profile-row UPDATE handler. Prevents the per-60s
    // heartbeat from triggering a full loadUserData() each tick.
    let lastProfileReloadAt = 0;

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
        // Watch our own profile row so a sign-in on another device flips
        // current_session_id and we can react within a second instead of
        // waiting for the next poll. loadUserData runs the comparison and
        // calls forceSignOutSuperseded when the value no longer matches.
        //
        // Coalesce repeated UPDATEs so the per-60s heartbeat
        // (touch_last_seen → last_seen_at) doesn't fan out into a fresh
        // SELECT-retry-RPC chain every minute. Same goes for trace heart-
        // beats, exit-survey writes, free-session consume, and journey
        // stamps — none of those touch the columns we actually re-read
        // for here. We ignore an UPDATE event entirely if it lands within
        // 1 s of the last reload, on the bet that an actual single-session
        // takeover from another device almost always settles in a single
        // event and we'll catch the value on the next user-driven nav.
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
          () => {
            const now = Date.now();
            if (now - lastProfileReloadAt < 1000) return;
            lastProfileReloadAt = now;
            loadUserData(userId);
          },
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
      // One-session-per-user marker — drop it so a re-sign-in mints a
      // fresh sid instead of trying to reuse the stale one.
      window.localStorage.removeItem('tm:session-id');
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

  // Depend on the user id, NOT the whole `session` object — supabase mints a
  // new session reference on every silent token refresh (every ~30 min). Tying
  // `refresh` to the object would re-create this callback each rotation and
  // re-fire any effect that depends on it (Trace.jsx, /upload, /account).
  const refresh = useCallback(
    () => loadUserData(session?.user?.id),
    [session?.user?.id, loadUserData]
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
  //  - Admins (profiles.is_admin = true) get full access regardless of
  //    subscription state. The flag is RLS-restricted to the user's own
  //    row and is the same source of truth used by the operator dashboard
  //    gate, so we trust it here too.
  const RENEWAL_GRACE_MS = 6 * 60 * 60 * 1000;
  const isPaid = (() => {
    if (profile?.is_admin === true) return true;
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
