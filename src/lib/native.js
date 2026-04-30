// Native-only helpers for the Android APK build (Capacitor wrapper).
//
// Everything in this file is a no-op when running in a regular browser.
// The web flow in Login.jsx / LoginModal.jsx is unchanged — those files
// just check `isNative` and short-circuit to the helpers here when true.
//
// Why this file exists in isolation:
//   - The site at tracemate.art and the APK share one codebase. Touching
//     supabase.signInWithOAuth in the shared files would break the web.
//   - Native sign-in needs Capacitor's plugin system, which only loads
//     inside the APK. Importing it on the web is harmless but wasteful;
//     we lazy-import to keep the web bundle the same size as before.

import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase.js';

export const isNative = Capacitor?.isNativePlatform?.() ?? false;

// One-time init, idempotent. Safe to call from main.jsx on every boot —
// SocialLogin.initialize is a no-op on the second call.
let initPromise = null;
export function ensureNativeAuthInit() {
  if (!isNative) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    await SocialLogin.initialize({
      google: {
        // The WEB OAuth client ID from Google Cloud Console — same one
        // Supabase uses for its Google provider. The Android OAuth client
        // (separately registered with the app's SHA-1) does NOT appear in
        // code; it just authorizes this package to issue tokens for the
        // web client.
        //
        // Hardcoded as the default so the APK works without the build
        // pipeline having to set VITE_GOOGLE_WEB_CLIENT_ID. Override via
        // env var only if you ever rotate the Google credentials.
        webClientId: import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID
          || '944673324350-2ai6vha5clek4ov6ob4t6sa6ctvg30im.apps.googleusercontent.com',
        mode: 'online',
      },
    });
  })();

  return initPromise;
}

// Native Google sign-in entry point.
//
// Flow:
//   1. Open the system Google account picker (in-process — no browser, no
//      WebView, no redirect).
//   2. Receive an ID token whose audience is the web client ID Supabase
//      knows about.
//   3. Hand the ID token to Supabase via signInWithIdToken — Supabase
//      verifies it server-side and issues a session immediately.
//   4. AuthProvider's onAuthStateChange listener picks up the new session
//      and the existing UI flow takes over (redirect to /account etc).
//
// On any error we throw — the caller (Login.jsx / LoginModal.jsx) shows
// the message in the existing error UI.
export async function nativeGoogleSignIn() {
  if (!isNative) throw new Error('nativeGoogleSignIn called outside native platform');
  await ensureNativeAuthInit();

  const { SocialLogin } = await import('@capgo/capacitor-social-login');

  const result = await SocialLogin.login({
    provider: 'google',
    options: { scopes: ['email', 'profile'] },
  });

  const idToken = result?.result?.idToken;
  if (!idToken) {
    throw new Error('Google sign-in did not return an ID token');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) throw error;
}

// Sign-out helper — keeps the native Google session in sync with Supabase.
// Optional; the existing AuthProvider.signOut() also works (it just leaves
// a stale Google session that re-prompts on next sign-in, which is fine).
export async function nativeGoogleSignOut() {
  if (!isNative) return;
  try {
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    await SocialLogin.logout({ provider: 'google' });
  } catch {
    // Ignore — Google logout failures shouldn't block Supabase signOut.
  }
}

// Deep-link listener — when Android delivers a tracemate.art URL to the
// app (e.g. payment redirect, App Link from email), Capacitor fires
// `appUrlOpen`. We forward the path+query to react-router via a custom
// event so the App component can navigate without losing state.
//
// Usage: call setupDeepLinks() once at app boot from main.jsx.
let deepLinksWired = false;
export async function setupDeepLinks() {
  if (!isNative || deepLinksWired) return;
  deepLinksWired = true;

  const { App } = await import('@capacitor/app');
  App.addListener('appUrlOpen', (event) => {
    try {
      const url = new URL(event.url);
      // Strip the host — we only care about the path inside the app.
      const target = url.pathname + url.search + url.hash;
      window.dispatchEvent(new CustomEvent('tm:deeplink', { detail: target }));
    } catch {
      // Malformed URL — drop it silently rather than crash the app.
    }
  });
}
