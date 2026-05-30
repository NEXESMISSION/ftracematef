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
 * Server-side analytics rollup + the webhook health sidecar. The business
 * stats panel that consumed `stats` was removed (a better one is coming); the
 * dashboard currently only uses `webhook_health` from this call, but the
 * `stats` payload is still returned for whatever replaces it. Returns:
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

/* ── Referral / affiliate program ──────────────────────────────────────────
 * All operator-side referral CRUD + payout actions route through the single
 * admin-referrals Edge Function (server-side triple-gated, same as the other
 * admin endpoints). Thin wrappers so the dashboard reads cleanly.
 */

// One element per referrer with signup/sale/commission aggregates.
export async function listReferrers() {
  const { data, error } = await supabase.functions.invoke('admin-referrals', {
    method: 'POST',
    body: { action: 'list' },
  });
  if (error) throw new Error(await unwrapFunctionError(error));
  if (data?.error) throw new Error(data.error);
  return data?.referrers ?? [];
}

// Create a partner. `code` is optional — omit to auto-generate a short slug.
export async function createReferrer(payload) {
  const { data, error } = await supabase.functions.invoke('admin-referrals', {
    method: 'POST',
    body: { action: 'create', ...payload },
  });
  if (error) throw new Error(await unwrapFunctionError(error));
  if (data?.error) throw new Error(data.error);
  return data?.referrer;
}

// Patch a partner (name/email/code/active/rate/flat/notes).
export async function updateReferrer(id, patch) {
  const { data, error } = await supabase.functions.invoke('admin-referrals', {
    method: 'POST',
    body: { action: 'update', id, patch },
  });
  if (error) throw new Error(await unwrapFunctionError(error));
  if (data?.error) throw new Error(data.error);
  return true;
}

// Issue a fresh self-view access token (invalidates the old partner link).
export async function rotateReferrerToken(id) {
  const { data, error } = await supabase.functions.invoke('admin-referrals', {
    method: 'POST',
    body: { action: 'rotate_token', id },
  });
  if (error) throw new Error(await unwrapFunctionError(error));
  if (data?.error) throw new Error(data.error);
  return data?.access_token;
}

// Flip every pending commission for a partner to paid (after you've sent the
// money). Returns the count marked paid.
export async function markCommissionsPaid(referrerId) {
  const { data, error } = await supabase.functions.invoke('admin-referrals', {
    method: 'POST',
    body: { action: 'mark_paid', referrer_id: referrerId },
  });
  if (error) throw new Error(await unwrapFunctionError(error));
  if (data?.error) throw new Error(data.error);
  return data?.updated ?? 0;
}

/* ── In-app announcements / broadcasts ─────────────────────────────────────
 * Operator-side CRUD for the popup broadcast system. All actions route through
 * the single admin-announcements Edge Function (server-side triple-gated, same
 * as the other admin endpoints). Thin wrappers so the dashboard reads cleanly.
 */

// One element per announcement with seen/tapped/dismissed aggregates.
export async function listAnnouncements() {
  const { data, error } = await supabase.functions.invoke('admin-announcements', {
    method: 'POST',
    body: { action: 'list' },
  });
  if (error) throw new Error(await unwrapFunctionError(error));
  if (data?.error) throw new Error(data.error);
  return data?.announcements ?? [];
}

// Publish a new announcement. payload: { title?, body, segment, cta_label?,
// cta_url?, frequency, expires_at? }.
export async function createAnnouncement(payload) {
  const { data, error } = await supabase.functions.invoke('admin-announcements', {
    method: 'POST',
    body: { action: 'create', ...payload },
  });
  if (error) throw new Error(await unwrapFunctionError(error));
  if (data?.error) throw new Error(data.error);
  return data?.announcement;
}

// Patch an announcement (title/body/segment/cta_label/cta_url/frequency/active/expires_at).
export async function updateAnnouncement(id, patch) {
  const { data, error } = await supabase.functions.invoke('admin-announcements', {
    method: 'POST',
    body: { action: 'update', id, patch },
  });
  if (error) throw new Error(await unwrapFunctionError(error));
  if (data?.error) throw new Error(data.error);
  return true;
}

// Permanently delete an announcement (cascades its events).
export async function deleteAnnouncement(id) {
  const { data, error } = await supabase.functions.invoke('admin-announcements', {
    method: 'POST',
    body: { action: 'delete', id },
  });
  if (error) throw new Error(await unwrapFunctionError(error));
  if (data?.error) throw new Error(data.error);
  return true;
}
