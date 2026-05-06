// Auto-refresh on new deploy, with a hard rule: never interrupt an active
// trace session. The poller fetches /version.json (served no-store) on a
// gentle cadence and on tab-focus. When the build id changes from what we
// booted with, we mark "update pending" and wait for a safe moment to
// reload — visible tab AND not currently tracing.
//
// Native (Capacitor) builds are skipped: the running JS is bundled inside
// the APK, not served from the network, so polling /version.json against
// the production host would either reload to a build the APK can't host or
// hammer a 404. Native gets updates through the Play Store, not the SW.

import { isTracing } from './tracing-state.js';

const POLL_MS         = 60_000;   // background cadence
const TRACING_RECHECK = 15_000;   // when we have a pending update, recheck the guard often
const VERSION_URL     = '/version.json';

let bootBuild = null;
let pendingBuild = null;
let pollTimer = null;
let guardTimer = null;
let started = false;

async function fetchBuild() {
  try {
    const res = await fetch(VERSION_URL, { cache: 'no-store', credentials: 'omit' });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.build === 'string' && data.build.length > 0 ? data.build : null;
  } catch {
    return null;
  }
}

function maybeReload() {
  if (!pendingBuild) return;
  if (document.visibilityState !== 'visible') return;
  if (isTracing()) return;
  // location.reload() bypasses the bf-cache and re-requests index.html.
  // Hashed JS/CSS bundles change name on every build, so the immutable
  // cache rule on /assets/* doesn't trap us on the old code.
  window.location.reload();
}

function scheduleGuard() {
  if (guardTimer != null) return;
  guardTimer = setInterval(maybeReload, TRACING_RECHECK);
}

async function tick() {
  const current = await fetchBuild();
  if (!current) return;
  if (bootBuild == null) {
    bootBuild = current;
    return;
  }
  if (current !== bootBuild && current !== pendingBuild) {
    pendingBuild = current;
    scheduleGuard();
    maybeReload();
  } else if (current === pendingBuild) {
    maybeReload();
  }
}

function isNativeShell() {
  // Capacitor injects window.Capacitor; cordova injects window.cordova.
  return typeof window !== 'undefined' && (window.Capacitor?.isNativePlatform?.() || !!window.cordova);
}

export function startUpdater() {
  if (started) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (isNativeShell()) return;
  started = true;

  tick();
  pollTimer = setInterval(tick, POLL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      tick();
      maybeReload();
    }
  });
}
