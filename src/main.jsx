import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { ensureNativeAuthInit, setupDeepLinks } from './lib/native.js';
import { initAnalytics } from './lib/analytics.js';
import './styles/globals.css';
import './styles/login.css';
import './styles/upload.css';
import './styles/trace.css';
import './styles/auth-app.css';
import './styles/live.css';
import './styles/admin.css';

// Native-only bootstrap. Both functions short-circuit on the web — no
// network, no plugin import, no perf cost.
ensureNativeAuthInit().catch(() => { /* surfaced when user actually signs in */ });
setupDeepLinks().catch(() => { /* deep links are best-effort */ });

// Analytics is no-op until VITE_PLAUSIBLE_DOMAIN or VITE_UMAMI_WEBSITE_ID is
// set at build time, so this is safe to call unconditionally.
initAnalytics();

// Force the page to load at the top — disable browser scroll restoration
// and clear any leftover hash so it doesn't auto-jump to a section.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (location.hash) {
  history.replaceState(null, '', location.pathname + location.search);
}
window.scrollTo(0, 0);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
