// Admin gate for UI-only dev tools.
//
// Reads `is_admin` from the user's `profiles` row (RLS-restricted to self).
// We deliberately avoid VITE_ADMIN_EMAILS — bundling the operator allowlist
// into the production JS exposes admin emails to anyone reading the bundle.
//
// Security boundary: this is a UI hint only. The actual gate is server-side
// in the dev-mutate-subscription / admin-list-users Edge Functions (still
// env-driven via ADMIN_EMAILS). Trust this for "should I render the panel?",
// never for authorising state changes.

import { supabase } from './supabase.js';
import { unwrapFunctionError } from './errors.js';

export function isAdminUser(profile) {
  return profile?.is_admin === true;
}

/**
 * Fetch every user (with their current subscription) for the /admin-me
 * dashboard. Server-side gates on ADMIN_EMAILS env + profiles.is_admin.
 */
export async function listAllUsers() {
  const { data, error } = await supabase.functions.invoke('admin-list-users', {
    method: 'POST',
    body: {},
  });
  if (error) throw new Error(await unwrapFunctionError(error));
  if (data?.error) throw new Error(data.error);
  return data?.users ?? [];
}

/**
 * Per-user activity log: subscription history, webhook events, sign-ins.
 * Returns { user, sub_history, events, sign_ins }.
 */
export async function getUserActivity(userId) {
  const { data, error } = await supabase.functions.invoke('admin-user-activity', {
    method: 'POST',
    body: { user_id: userId },
  });
  if (error) throw new Error(await unwrapFunctionError(error));
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Server-side analytics rollup for the StatsPanel + the webhook health
 * sidecar. Returns:
 *   { stats: { funnel, revenue, activity, engagement, top_users, at_risk },
 *     webhook_health: { stuck_count, stuck_24h_count, oldest_stuck_age_secs, recent } }
 *
 * One request → two parallel server-side queries → both payloads. The
 * aggregation runs server-side via get_admin_stats() + get_webhook_health()
 * so the client doesn't have to walk every row of profiles + subscriptions
 * + trace_session_runs + webhook_events.
 */
export async function getAdminStats() {
  const { data, error } = await supabase.functions.invoke('admin-stats', {
    method: 'POST',
    body: {},
  });
  if (error) throw new Error(await unwrapFunctionError(error));
  if (data?.error) throw new Error(data.error);
  return {
    stats:          data?.stats ?? null,
    webhook_health: data?.webhook_health ?? null,
  };
}
