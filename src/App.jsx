import { lazy, Suspense, useEffect, useRef } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import RequirePaid from './auth/RequirePaid.jsx';
import RequireAdmin from './auth/RequireAdmin.jsx';
import { endTrialSession } from './lib/freeTrial.js';
import { trackPageview } from './lib/analytics.js';

import Home from './pages/Home.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import AuthCallback from './pages/AuthCallback.jsx';
import Upload from './pages/Upload.jsx';
import Trace from './pages/Trace.jsx';
import LivePreview from './pages/LivePreview.jsx';
import Account from './pages/Account.jsx';
import CheckoutSuccess from './pages/CheckoutSuccess.jsx';
import PricingPage from './pages/PricingPage.jsx';
import Terms from './pages/Terms.jsx';
import Privacy from './pages/Privacy.jsx';
import NotFound from './pages/NotFound.jsx';

// Admin dashboard is operator-only and ships its own bundle of UI + data
// fetching helpers. Lazy-loaded so non-admins never download the chunk.
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'));

// One-shot free trial: the moment a free user navigates AWAY from /trace,
// their single session is consumed for good. Doing this at the route layer
// (rather than in Trace.jsx's unmount cleanup) is deliberate — unmount also
// fires on a page refresh, which would lock the user out for accidentally
// hitting F5 mid-session. A pathname change in react-router only fires for
// SPA navigation, never for refresh, so this is the right hook.
function TrialSessionTracker() {
  const { pathname } = useLocation();
  const prev = useRef(pathname);
  useEffect(() => {
    if (prev.current === '/trace' && pathname !== '/trace') {
      endTrialSession();
    }
    prev.current = pathname;
  }, [pathname]);
  return null;
}

// Drives route-change pageviews into the analytics provider. No-op for
// Plausible / Umami (their v2 scripts auto-track pushState); required for
// GoatCounter, which only counts the initial load otherwise.
function AnalyticsRouteTracker() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    trackPageview();
  }, [pathname, search]);
  return null;
}

// Native-only: listens for `tm:deeplink` events fired by lib/native.js when
// Android delivers a tracemate.art URL to the app (App Link, payment redirect,
// magic-link from email, etc.). Navigates the SPA to the inner path so the
// user lands inside the app instead of bouncing to a browser.
//
// On the web this hook still mounts but never fires — the event is only
// dispatched from the native deep-link bridge.
function DeepLinkRouter() {
  const navigate = useNavigate();
  useEffect(() => {
    const onDeepLink = (e) => {
      const target = e?.detail;
      if (typeof target === 'string' && target.startsWith('/')) {
        navigate(target, { replace: false });
      }
    };
    window.addEventListener('tm:deeplink', onDeepLink);
    return () => window.removeEventListener('tm:deeplink', onDeepLink);
  }, [navigate]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <TrialSessionTracker />
      <AnalyticsRouteTracker />
      <DeepLinkRouter />
      <Routes>
        {/* Public — anyone can browse + start an upload */}
        <Route path="/"              element={<Home />} />
        <Route path="/welcome"       element={<Landing />} />
        <Route path="/login"         element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/upload"        element={<Upload />} />
        <Route path="/pricing"       element={<PricingPage />} />
        <Route path="/terms"         element={<Terms />} />
        <Route path="/privacy"       element={<Privacy />} />

        {/* Auth required (free users allowed) */}
        <Route path="/account"          element={<RequireAuth><Account /></RequireAuth>} />
        <Route path="/live"             element={<RequireAuth><LivePreview /></RequireAuth>} />
        <Route path="/checkout/success" element={<RequireAuth><CheckoutSuccess /></RequireAuth>} />

        {/* Paid plan required — Paywall shown otherwise */}
        <Route path="/trace"  element={<RequirePaid><Trace /></RequirePaid>} />

        {/* Secret operator dashboard — non-admins see <NotFound> (no redirect leak). */}
        <Route
          path="/admin-me"
          element={
            <RequireAdmin>
              <Suspense fallback={null}>
                <AdminDashboard />
              </Suspense>
            </RequireAdmin>
          }
        />

        {/* Catch-all — anything else gets a friendly Not Found rather than blank */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
