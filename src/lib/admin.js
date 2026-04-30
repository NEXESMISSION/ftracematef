// Mirror of the server-side admin allowlist, used purely for hiding the dev
// UI. The actual security boundary is the edge function — never trust this
// for anything sensitive, only for "should we render this button?".
//
// VITE_ADMIN_EMAILS is a comma-separated list. Empty / unset means no admins
// (panel hidden for everyone), which is the right default for production.

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function isAdminUser(user) {
  if (!user?.email) return false;
  return ADMIN_EMAILS.includes(user.email.trim().toLowerCase());
}
