// Admin gate for UI-only dev tools.
//
// Reads `is_admin` from the user's `profiles` row (RLS-restricted to self).
// We deliberately avoid VITE_ADMIN_EMAILS — bundling the operator allowlist
// into the production JS exposes admin emails to anyone reading the bundle.
//
// Security boundary: this is a UI hint only. The actual gate is server-side
// in the dev-mutate-subscription Edge Function (still env-driven via
// ADMIN_EMAILS). Trust this for "should I render the panel?", never for
// authorising state changes.

export function isAdminUser(profile) {
  return profile?.is_admin === true;
}
