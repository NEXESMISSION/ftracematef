import { supabase } from './supabase.js';

/**
 * Free-tier trial of the studio for signed-in non-paying users.
 *
 * Each account gets `FREE_SESSION_LIMIT` separate `/trace` sessions before
 * the paywall locks them out. A "session" = one entry into `/trace`. Page
 * refreshes mid-session don't burn another, but navigating away and coming
 * back does.
 *
 * Three stores cooperate:
 *   1. `profiles.free_sessions_used` (DB, incremented by `consume_free_session`
 *      RPC) — the durable counter. Tied to the account, not the device, so it
 *      follows the user across devices and sessions.
 *   2. `sessionStorage[TRIAL_SESSION_KEY]` flag — marks "this tab is currently
 *      inside an active trial session". Survives a refresh of `/trace`, but
 *      auto-clears when the tab closes, and we explicitly clear it the moment
 *      the user navigates away from `/trace` (App.jsx tracker).
 *   3. `sessionStorage[CONSUMED_KEY]` flag — marks "we already burned a
 *      session for THIS `/trace` visit". Prevents a page refresh inside the
 *      studio from double-consuming. Cleared together with TRIAL_SESSION_KEY
 *      when the user leaves `/trace`.
 *
 * The in-memory `inMemoryFlag` is a fallback for environments where
 * sessionStorage throws (Safari private mode, sandboxed webviews). It still
 * keeps the trial usable for the duration of the current JS context.
 *
 * `profiles.free_trial_started_at` is now a "first-use" timestamp — the RPC
 * stamps it on the very first consume — and isn't load-bearing for the gate
 * logic. It's kept for analytics + the existing dev-panel reset flow.
 */

export const FREE_SESSION_LIMIT = 5;

const TRIAL_SESSION_KEY = 'tm:trial-session-active';
const CONSUMED_KEY      = 'tm:trial-consumed-this-session';
let inMemoryFlag = false;

function sessionFlagSet() {
  if (inMemoryFlag) return true;
  try { return sessionStorage.getItem(TRIAL_SESSION_KEY) === '1'; } catch { return false; }
}

/**
 * 'available' — counter under the cap, free user can enter `/trace` for a fresh session.
 * 'active'    — this tab is currently inside a trial session (refresh-safe).
 * 'used'      — counter at the cap AND no active session in this tab — paywall.
 *
 * Pass the `profile` object from useAuth(). If profile is missing (still
 * loading or load failed) we report 'available' so the gate doesn't lock
 * out a user we just haven't fetched yet — RequirePaid waits for loading
 * to settle before evaluating.
 */
export function freeTrialState(profile) {
  // Active sessions trump everything: a user who's mid-trace stays in even
  // when their counter just ticked to the cap on the most recent consume.
  if (sessionFlagSet()) return 'active';
  const used = profile?.free_sessions_used ?? 0;
  return used < FREE_SESSION_LIMIT ? 'available' : 'used';
}

/** Sessions remaining (0..FREE_SESSION_LIMIT) for surfacing in the UI. */
export function freeSessionsLeft(profile) {
  const used = profile?.free_sessions_used ?? 0;
  return Math.max(0, FREE_SESSION_LIMIT - used);
}

/** True when a free user can step into `/trace` (fresh OR mid-session). */
export function canUseFreeTrial(profile) {
  return freeTrialState(profile) !== 'used';
}

/**
 * Mark this tab as the active free-trial session. Must be called BEFORE the
 * user lands on `/trace` (or as soon as RequirePaid decides to admit them),
 * because the post-consume profile-update re-render would otherwise see no
 * session flag and — on the user's last available session — flip RequirePaid
 * from 'available' straight to 'used', kicking the user back out before they
 * get to trace anything.
 */
export function beginTrialSession() {
  inMemoryFlag = true;
  try { sessionStorage.setItem(TRIAL_SESSION_KEY, '1'); } catch { /* ignore */ }
}

/**
 * End the session — called by App.jsx the moment the user leaves `/trace`,
 * by AuthProvider on sign-out / user-swap, and by the ghost-session cleanup.
 *
 * Also clears the per-visit consumed marker so the user's NEXT entry into
 * `/trace` correctly burns a fresh session.
 */
export function endTrialSession() {
  inMemoryFlag = false;
  try {
    sessionStorage.removeItem(TRIAL_SESSION_KEY);
    sessionStorage.removeItem(CONSUMED_KEY);
  } catch { /* ignore */ }
}

/** True if this `/trace` visit has already burned a session. */
export function trialAlreadyConsumedThisVisit() {
  try { return sessionStorage.getItem(CONSUMED_KEY) === '1'; } catch { return false; }
}

/** Mark this `/trace` visit as having consumed its session. */
function markConsumedThisVisit() {
  try { sessionStorage.setItem(CONSUMED_KEY, '1'); } catch { /* ignore */ }
}

/**
 * Consume one free session: atomically increments `free_sessions_used` if
 * still under the cap, otherwise no-ops at the cap. Idempotent within a
 * single `/trace` visit — the per-visit sessionStorage marker prevents a
 * page refresh from double-burning a session.
 *
 * Returns the post-call count, or null if the visit had already consumed.
 */
export async function consumeFreeSession() {
  if (trialAlreadyConsumedThisVisit()) return null;
  const { data, error } = await supabase.rpc('consume_free_session');
  if (error) throw new Error(error.message || 'Could not consume free session');
  // Stamp AFTER a successful RPC: a network failure shouldn't lock the user
  // out of a retry on the next render.
  markConsumedThisVisit();
  return data;
}
