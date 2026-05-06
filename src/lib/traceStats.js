// Pure formatters used by the /account stats grid and the admin dashboard.
//
// The localStorage-based stats tracker that used to live here was retired
// once trace_session_runs + profiles.{total_trace_seconds, trace_sessions,
// last_trace_at} became authoritative — those server columns are kept
// fresh by start_trace_run / end_trace_run / heartbeat_trace_run /
// reconcile_trace_runs and reach the client via the AuthProvider realtime
// subscription. Reading from the profile means /account and /admin-me
// always agree; the local mirror was per-device, so it would silently
// diverge whenever the user switched browsers or cleared cache.

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
