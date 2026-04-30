// Admin gate for dev-only edge functions (e.g. dev-mutate-subscription).
//
// Looks at `ADMIN_EMAILS` (comma-separated) and matches case-insensitively
// against the authenticated user's email. The frontend has its own copy of
// the list for hiding UI; this is the actual security boundary — never grant
// based on a client-supplied flag.

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = Deno.env.get('ADMIN_EMAILS') ?? '';
  const allow = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.trim().toLowerCase());
}
