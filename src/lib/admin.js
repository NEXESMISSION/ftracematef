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
