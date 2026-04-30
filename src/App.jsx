import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import RequirePaid from './auth/RequirePaid.jsx';

import Home from './pages/Home.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import AuthCallback from './pages/AuthCallback.jsx';
import Upload from './pages/Upload.jsx';
import Trace from './pages/Trace.jsx';
import Account from './pages/Account.jsx';
import CheckoutSuccess from './pages/CheckoutSuccess.jsx';
import PricingPage from './pages/PricingPage.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public — anyone can browse + start an upload */}
        <Route path="/"              element={<Home />} />
        <Route path="/welcome"       element={<Landing />} />
        <Route path="/login"         element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/upload"        element={<Upload />} />
        <Route path="/pricing"       element={<PricingPage />} />

        {/* Auth required (free users allowed) */}
        <Route path="/account"          element={<RequireAuth><Account /></RequireAuth>} />
        <Route path="/checkout/success" element={<RequireAuth><CheckoutSuccess /></RequireAuth>} />

        {/* Paid plan required — Paywall shown otherwise */}
        <Route path="/trace"  element={<RequirePaid><Trace /></RequirePaid>} />

        {/* Catch-all — anything else gets a friendly Not Found rather than blank */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
