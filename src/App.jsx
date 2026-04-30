import { useEffect, useRef } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import RequirePaid from './auth/RequirePaid.jsx';
import { endTrialSession } from './lib/freeTrial.js';

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

export default function App() {
  return (
    <AuthProvider>
      <TrialSessionTracker />
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

        {/* Catch-all — anything else gets a friendly Not Found rather than blank */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
