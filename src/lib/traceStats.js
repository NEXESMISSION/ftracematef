// Trace stats tracker — stored in localStorage, scoped per user.
// Schema: { totalSeconds, sessions, firstSessionAt, lastSessionAt }
//
// Two-phase accounting:
//   - startSession() runs the moment the user enters the trace studio with an
//     image. It bumps `sessions` and stamps first/lastSessionAt. The count is
//     a "did the user open a tracing session?" metric, not a "did they trace
//     for ≥ N seconds?" metric — opening counts even if they walk away.
//   - addSessionDuration() runs on exit and only accumulates `totalSeconds`.
//     Never touches the count or timestamps.
const KEY_PREFIX = 'tm:traceStats:';

const empty = () => ({
  totalSeconds: 0,
  sessions: 0,
  firstSessionAt: null,
  lastSessionAt: null,
});

function keyFor(userId) {
  // No fallback to a shared "anon" bucket — see startSession() for why. We
  // return null when there's no user, and getStats short-circuits to an
  // empty record. Reading this way is harmless; it's writing without a
  // userId that would leak data across accounts on a shared device.
  return userId ? `${KEY_PREFIX}${userId}` : null;
}

export function getStats(userId) {
  try {
    const key = keyFor(userId);
    if (!key) return empty();
    const raw = window.localStorage.getItem(key);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

export function startSession(userId) {
  // Refuse to write without a user id. Previously a falsy userId was
  // bucketed into `tm:traceStats:anon` — that bucket survived sign-out and
  // mixed with whichever user signed in next on the same device. Better to
  // drop the session than to leak it across accounts. Trace.jsx is gated by
  // RequirePaid, so this branch is only reachable in narrow races (session
  // expiring mid-trace) where losing the count is the right trade-off.
  if (!userId) return null;
  const key = keyFor(userId);
  const now = new Date().toISOString();
  const stats = getStats(userId);
  const next = {
    ...stats,
    sessions:        stats.sessions + 1,
    firstSessionAt:  stats.firstSessionAt ?? now,
    lastSessionAt:   now,
  };
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch { /* quota / private mode — ignore */ }
  return next;
}

export function addSessionDuration(userId, durationSec) {
  if (!userId) return null;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null;
  const key = keyFor(userId);
  const stats = getStats(userId);
  const next = {
    ...stats,
    totalSeconds: Math.round(stats.totalSeconds + durationSec),
  };
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch { /* quota / private mode — ignore */ }
  return next;
}

export function formatDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds < 60) {
    return `${Math.round(totalSeconds || 0)}s`;
  }
  const m = Math.floor(totalSeconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH ? `${d}d ${remH}h` : `${d}d`;
}

export function formatRelative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 60)         return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60)         return `${min} min ago`;
  const hr  = Math.floor(min / 60);
  if (hr < 24)          return hr === 1 ? '1 hour ago' : `${hr} hours ago`;
  const day = Math.floor(hr / 24);
  if (day < 7)          return day === 1 ? 'yesterday' : `${day} days ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5)           return wk === 1 ? '1 week ago' : `${wk} weeks ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12)          return mo === 1 ? '1 month ago' : `${mo} months ago`;
  const yr = Math.floor(day / 365);
  return yr === 1 ? '1 year ago' : `${yr} years ago`;
}
