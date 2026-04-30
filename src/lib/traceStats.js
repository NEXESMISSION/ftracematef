// Trace stats tracker — stored in localStorage, scoped per user when possible.
// Schema: { totalSeconds, sessions, firstSessionAt, lastSessionAt }
const KEY_PREFIX = 'tm:traceStats:';
const ANON_KEY   = `${KEY_PREFIX}anon`;
const MIN_SESSION_SECONDS = 5; // sessions shorter than this are ignored

const empty = () => ({
  totalSeconds: 0,
  sessions: 0,
  firstSessionAt: null,
  lastSessionAt: null,
});

function keyFor(userId) {
  return userId ? `${KEY_PREFIX}${userId}` : ANON_KEY;
}

export function getStats(userId) {
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

export function addSession(userId, durationSec) {
  if (!Number.isFinite(durationSec) || durationSec < MIN_SESSION_SECONDS) return null;
  const now = new Date().toISOString();
  const stats = getStats(userId);
  const next = {
    totalSeconds:    Math.round(stats.totalSeconds + durationSec),
    sessions:        stats.sessions + 1,
    firstSessionAt:  stats.firstSessionAt ?? now,
    lastSessionAt:   now,
  };
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(next));
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
