import { useAuth } from './AuthProvider.jsx';
import { useAuthGate } from './AuthGate.jsx';
import { isAdminUser } from '../lib/admin.js';
import NotFound from '../pages/NotFound.jsx';

/**
 * Gate the secret /admin-me dashboard.
 *
 * Non-admins (signed-in or not) get the standard 404 — never a redirect to
 * /login or a flash of admin chrome. The route stays invisible to anyone
 * without `profiles.is_admin = true`. The actual data access is gated
 * server-side by the admin-list-users edge function (ADMIN_EMAILS env +
 * is_admin DB flag), so this is purely a UX cloak.
 */
export default function RequireAdmin({ children }) {
  const { profile } = useAuth();
  const gate = useAuthGate();

  if (gate.element) return gate.element;

  if (!isAdminUser(profile)) return <NotFound />;

  return children;
}
