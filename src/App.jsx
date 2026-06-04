import { lazy, Suspense, useEffect, useRef } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import RequirePaid from './auth/RequirePaid.jsx';
import RequireAdmin from './auth/RequireAdmin.jsx';
import { endTrialSession } from './lib/freeTrial.js';
import { trackPageview } from './lib/analytics.js';
import { initTracking, trackPageview as trackPulsePageview } from './lib/track.js';
import HeatmapTracker from './components/HeatmapTracker.jsx';

// Eager: the public entry points users hit first (landing/home/auth/redirects).
// Keeping these in the main chunk avoids a Suspense flash on the most common
// cold-start paths.
import Home from './pages/Home.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import AuthCallback from './pages/AuthCallback.jsx';
import RefRedirect from './pages/RefRedirect.jsx';
import AffiliateRedirect from './pages/AffiliateRedirect.jsx';
import NotFound from './pages/NotFound.jsx';
import AnnouncementPopup from './components/AnnouncementPopup.jsx';

// Pretty-alias short links for the platforms we'll actually share most.
// Each one renders <RefRedirect source="..."/> and bounces to '/'. The
// slug is stamped to localStorage so the next time this browser signs up,
// AuthProvider attributes the new account to that source.
//
// Adding a new platform = one line below. Anything one-off (TikTok video
// 3, Reddit r/foo thread) should use the open-ended /r/:source route
// instead of grabbing a new top-level path.
const REF_ALIASES = ['tiktok', 'tt', 'reddit', 'yt', 'ig', 'x', 'threads'];

// Lazy import that survives a stale-chunk 404. After a deploy, the old hashed
// chunk filenames are gone; a tab still running the previous build that then
// navigates to a lazy route would fail the dynamic import and crash to the
// ErrorBoundary (which users read as "logged out / broken"). On the first such
// failure we reload ONCE to pull the fresh build, guarded by a sessionStorage
// flag so a genuinely missing chunk can't loop. The flag clears on success.
function lazyWithReload(factory, key) {
  const flag = `tm:chunk-reload:${key}`;
  return lazy(() =>
    factory().then(
      (mod) => { try { sessionStorage.removeItem(flag); } catch { /* ignore */ } return mod; },
      (err) => {
        let already = false;
        try { already = sessionStorage.getItem(flag) === '1'; } catch { /* ignore */ }
        if (!already) {
          try { sessionStorage.setItem(flag, '1'); } catch { /* ignore */ }
          window.location.reload();
          return new Promise(() => {}); // hold render until the reload happens
        }
        throw err; // already retried once → let the ErrorBoundary surface it
      },
    ),
  );
}

// Admin dashboard is operator-only and ships its own bundle of UI + data
// fetching helpers. Lazy-loaded so non-admins never download the chunk.
const AdminDashboard = lazyWithReload(() => import('./pages/AdminDashboard.jsx'), 'admin');

// Affiliate self-view — niche, no account needed, only opened by partners
// who have a token link. Lazy so it never weighs on the main bundle.
const Partner = lazyWithReload(() => import('./pages/Partner.jsx'), 'partner');

// Heavy / behind-a-tap routes — lazy-split so a first-time landing visitor
// doesn't download the trace studio, perspective-warp math, recorder, pricing,
// and account screens before seeing the hero. Each is reachable only after a
// click or sign-in, so a brief Suspense fallback is invisible in practice and
// the top-of-funnel first paint gets dramatically lighter.
const Upload          = lazyWithReload(() => import('./pages/Upload.jsx'), 'upload');
const Trace           = lazyWithReload(() => import('./pages/Trace.jsx'), 'trace');
const LivePreview     = lazyWithReload(() => import('./pages/LivePreview.jsx'), 'live');
const Account         = lazyWithReload(() => import('./pages/Account.jsx'), 'account');
const Streaks          = lazyWithReload(() => import('./pages/Streaks.jsx'), 'streaks');
const CommunityGallery = lazyWithReload(() => import('./pages/CommunityGallery.jsx'), 'gallery');
const CheckoutSuccess = lazyWithReload(() => import('./pages/CheckoutSuccess.jsx'), 'checkout');
const PricingPage     = lazyWithReload(() => import('./pages/PricingPage.jsx'), 'pricing');
const Terms           = lazyWithReload(() => import('./pages/Terms.jsx'), 'terms');
const Privacy         = lazyWithReload(() => import('./pages/Privacy.jsx'), 'privacy');
const HowToUse        = lazyWithReload(() => import('./pages/HowToUse.jsx'), 'howto');

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
  // Boot our first-party tracker once (sets up the flush timer + lifecycle
  // hooks). Idempotent, so calling it from the route tracker is safe.
  useEffect(() => { initTracking(); }, []);
  useEffect(() => {
    trackPageview();              // optional 3rd-party shim (Plausible/Umami/…)
    trackPulsePageview(pathname); // first-party Pulse dashboard
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
      <HeatmapTracker />
      <DeepLinkRouter />
      <Suspense fallback={null}>
      <Routes>
        {/* Traffic-source attribution — /r/:source plus a hand-picked set of
            pretty aliases (tracemate.art/tiktok, /reddit, etc.) for the
            platforms we'll share most often. Both forms stamp localStorage
            and immediately bounce to '/'. */}
        <Route path="/r/:source" element={<RefRedirect />} />
        {REF_ALIASES.map((slug) => (
          <Route key={slug} path={`/${slug}`} element={<RefRedirect source={slug} />} />
        ))}

        {/* Affiliate referral links — tracemate.art/i/:code. Stamps the
            partner's code first-touch (cookie + localStorage) and bounces to
            '/'. The commission system pays out on signups + sales attributed
            to it. */}
        <Route path="/i/:code" element={<AffiliateRedirect />} />

        {/* Affiliate self-view — partners open this with their private token
            link to see their own signups / sales / commission. No account. */}
        <Route
          path="/partner"
          element={<Suspense fallback={null}><Partner /></Suspense>}
        />

        {/* Public — anyone can browse + start an upload */}
        <Route path="/"              element={<Home />} />
        <Route path="/welcome"       element={<Landing />} />
        <Route path="/login"         element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/upload"        element={<Upload />} />
        <Route path="/pricing"       element={<PricingPage />} />
        <Route path="/terms"         element={<Terms />} />
        <Route path="/privacy"       element={<Privacy />} />

        {/* Best-practices guide — SEO/AI surface. /proportions is an alias. */}
        <Route path="/how-to-use"    element={<HowToUse />} />
        <Route path="/proportions"   element={<HowToUse />} />

        {/* Auth required (free users allowed) */}
        <Route path="/account"          element={<RequireAuth><Account /></RequireAuth>} />
        <Route path="/streaks"          element={<RequireAuth><Streaks /></RequireAuth>} />
        <Route path="/gallery"          element={<RequireAuth><CommunityGallery /></RequireAuth>} />
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

        {/* A1 library management now lives in the admin dashboard's "Library"
            tab (/admin-me), so the standalone route was removed. */}

        {/* Catch-all — anything else gets a friendly Not Found rather than blank */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>

      {/* Global broadcast popup. Renders null unless a signed-in user has an
          announcement to see; lives inside AuthProvider (for useAuth) and the
          BrowserRouter from main.jsx (so its CTA can navigate). */}
      <AnnouncementPopup />
    </AuthProvider>
  );
}
