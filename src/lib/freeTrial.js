import { supabase } from './supabase.js';

/**
 * One-shot free trial of the studio for signed-in free users.
 *
 * Two stores cooperate:
 *   1. `profiles.free_trial_started_at` (DB, set by `start_free_trial_if_unused`
 *      RPC) — the durable record that this account has used its trial. Tied
 *      to the account, not the device, so it follows the user everywhere.
 *   2. `sessionStorage` flag — marks "this tab is currently inside the
 *      one-shot trial session". Survives a page refresh of `/trace`, but is
 *      auto-cleared when the tab closes, and we explicitly clear it the
 *      moment the user navigates away from `/trace` (App.jsx tracker).
 *
 * Together: once the DB stamp is set, the user is 'active' only as long as
 * the session flag is live. Leave `/trace` — even by clicking the back
 * button — and the trial is gone for good. There is no time-based grace
 * window: this is intentionally a single-session-only privilege.
 *
 * The in-memory `inMemoryFlag` is a fallback for environments where
 * sessionStorage throws (Safari private mode, sandboxed webviews). It still
 * keeps the trial usable for the duration of the current JS context, which
 * covers the common single-page session.
 */

const TRIAL_SESSION_KEY = 'tm:trial-session-active';
let inMemoryFlag = false;

/**
 * 'available' — no DB stamp yet, free user can enter `/trace` for their one shot.
 * 'active'    — DB stamp set AND this tab still has the live session flag.
 * 'used'      — DB stamp set, session flag gone — trial is done, paywall.
 *
 * Pass the `profile` object from useAuth(). If profile is missing (still
 * loading or load failed) we report 'available' so the gate doesn't lock
 * out a user we just haven't fetched yet — RequirePaid waits for loading
 * to settle before evaluating.
 */
export function freeTrialState(profile) {
  const at = profile?.free_trial_started_at;
  if (!at) return 'available';
  if (inMemoryFlag) return 'active';
  try {
    if (sessionStorage.getItem(TRIAL_SESSION_KEY) === '1') return 'active';
  } catch { /* ignore — private mode / sandboxed */ }
  return 'used';
}

/** True when a free user can step into `/trace` (untouched OR mid-session). */
export function canUseFreeTrial(profile) {
  return freeTrialState(profile) !== 'used';
}

/**
 * Mark this tab as the active free-trial session. Must be called BEFORE the
 * user lands on `/trace` (or as soon as RequirePaid decides to admit them),
 * because the post-stamp profile-update re-render would otherwise see no
 * session flag and flip RequirePaid from 'available' straight to 'used',
 * kicking the user back out before they get to trace anything.
 */
export function beginTrialSession() {
  inMemoryFlag = true;
  try { sessionStorage.setItem(TRIAL_SESSION_KEY, '1'); } catch { /* ignore */ }
}

/** End the session — called by App.jsx the moment the user leaves `/trace`. */
export function endTrialSession() {
  inMemoryFlag = false;
  try { sessionStorage.removeItem(TRIAL_SESSION_KEY); } catch { /* ignore */ }
}

/**
 * Stamp the trial start in the DB if it isn't already. Idempotent: a second
 * call (or a concurrent call from another tab) returns the existing value
 * without overwriting.
 *
 * Returns the trial-start timestamp as an ISO string, or null if the RPC
 * succeeded but the row wasn't found (shouldn't happen for a signed-in user).
 */
export async function markFreeTrialStarted() {
  const { data, error } = await supabase.rpc('start_free_trial_if_unused');
  if (error) throw new Error(error.message || 'Could not start free trial');
  return data;
}
