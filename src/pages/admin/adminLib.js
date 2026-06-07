// Shared, dependency-free helpers + constants for the admin dashboard.
// Extracted from the former 2.8k-line AdminDashboard.jsx monolith so the shell
// and the individual panels can import one source of truth. Pure functions /
// data only — no React, no JSX, no side effects.

// Anyone seen pinging the heartbeat within this window is treated as "in the
// app right now". Tab visibility throttles the heartbeat to 60s, so 2 minutes
// gives one missed-tick of slack before the dot drops.
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;

// "User is currently tracing" requires the trace_session_runs heartbeat
// (every 30s) to be fresher than this. 45s = one heartbeat interval +
// 15s grace, matching the server-side reconcile threshold.
export const TRACE_HEARTBEAT_FRESH_MS = 45 * 1000;

export function isTracingNow(u) {
  if (!u) return false;
  if (u.current_page !== 'trace') return false;
  const hb = u.last_seen_at;
  if (!hb) return false;
  const t = new Date(hb).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < TRACE_HEARTBEAT_FRESH_MS;
}

// Canonical email local-part for de-duplication: lowercased, +tag stripped.
// We deliberately don't strip Gmail-style dots — that's provider-specific
// and risks merging unrelated accounts on non-Gmail domains.
export function emailLocalPart(email) {
  if (!email) return '';
  const at = email.indexOf('@');
  if (at < 0) return email.toLowerCase();
  const local = email.slice(0, at).toLowerCase();
  const plus = local.indexOf('+');
  return plus < 0 ? local : local.slice(0, plus);
}

// Collapse two-or-more rows that share a canonical local part (the same
// person signed up with `name@hotmail.com` and `name@gmail.com`) into one
// merged row. Across our user base this is a reliable "same person" signal —
// genuine collisions across providers are vanishingly rare for the kinds
// of email locals real users have.
//
// Merge rules:
//   - lead = the row most useful to the operator (paid first, then freshest activity)
//   - sums  : trace_sessions, total_trace_seconds
//   - max ts: last_seen_at, last_sign_in_at, last_trace_at
//   - min ts: created_at, first_trace_at (earliest signup / first trace)
//   - any-true: is_paid, trial_used
//   - aliases: emails of the rows folded into the lead, surfaced in the UI
export function mergeUserGroup(group) {
  if (group.length === 1) return group[0];
  const sorted = group.slice().sort((a, b) => {
    if (!!a.is_paid !== !!b.is_paid) return a.is_paid ? -1 : 1;
    const ta = new Date(a.last_seen_at || a.last_sign_in_at || a.created_at || 0).getTime();
    const tb = new Date(b.last_seen_at || b.last_sign_in_at || b.created_at || 0).getTime();
    return tb - ta;
  });
  const lead = sorted[0];
  const aliases = group.filter((u) => u.id !== lead.id).map((u) => u.email).filter(Boolean);
  const sumNum = (k) => group.reduce((s, u) => s + (Number(u[k]) || 0), 0);
  const ms = (v) => (v ? new Date(v).getTime() : null);
  const maxTs = (k) => {
    let best = null;
    for (const u of group) {
      const t = ms(u[k]);
      if (t != null && (best == null || t > best)) best = t;
    }
    return best == null ? null : new Date(best).toISOString();
  };
  const minTs = (k) => {
    let best = null;
    for (const u of group) {
      const t = ms(u[k]);
      if (t != null && (best == null || t < best)) best = t;
    }
    return best == null ? null : new Date(best).toISOString();
  };
  return {
    ...lead,
    aliases,
    is_paid:             group.some((u) => u.is_paid),
    trial_used:          group.some((u) => u.trial_used),
    total_trace_seconds: sumNum('total_trace_seconds'),
    trace_sessions:      sumNum('trace_sessions'),
    created_at:          minTs('created_at')      ?? lead.created_at,
    first_trace_at:      minTs('first_trace_at')  ?? lead.first_trace_at,
    last_seen_at:        maxTs('last_seen_at')    ?? lead.last_seen_at,
    last_sign_in_at:     maxTs('last_sign_in_at') ?? lead.last_sign_in_at,
    last_trace_at:       maxTs('last_trace_at')   ?? lead.last_trace_at,
  };
}

// Group raw users by canonical local-part and merge dupes. Admins stay in
// the list with their badge; the count tiles below filter them out.
export function normalizeUsers(rawUsers) {
  if (!Array.isArray(rawUsers)) return [];
  const groups = new Map();
  const noKey = [];
  for (const u of rawUsers) {
    const key = emailLocalPart(u.email);
    if (!key) { noKey.push(u); continue; }
    const arr = groups.get(key);
    if (arr) arr.push(u); else groups.set(key, [u]);
  }
  return [...Array.from(groups.values()).map(mergeUserGroup), ...noKey];
}

export const STATUS_TONE = {
  active:    'good',
  on_hold:   'warn',
  cancelled: 'neutral',
  expired:   'neutral',
  failed:    'bad',
};

export function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatRelative(iso) {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'never';
  const diff = Date.now() - then;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) {
    const m = Math.round(diff / 60_000);
    return `${m} min${m === 1 ? '' : 's'} ago`;
  }
  if (diff < 86_400_000) {
    const h = Math.round(diff / 3_600_000);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  const days = Math.round(diff / 86_400_000);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} mo ago`;
  const years = Math.round(months / 12);
  return `${years} yr${years === 1 ? '' : 's'} ago`;
}

export function formatMoney(cents, currency = 'USD') {
  if (cents == null) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function isOnline(lastSeen) {
  if (!lastSeen) return false;
  const t = new Date(lastSeen).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < ONLINE_WINDOW_MS;
}

// Classify each user by where they got in the funnel. Priority order
// matters — a paid user is paid even if they also hit the paywall once.
// 'ghost' is the catch-all for users who signed up and did literally
// nothing else, which is the most actionable segment to investigate.
export const STAGE_DEFS = {
  paid:   { label: 'Paid',         tone: 'good',    blurb: 'Paying customer' },
  warm:   { label: 'Bailed checkout', tone: 'warn', blurb: 'Opened Dodo checkout but didn\'t finish — recoverable lead' },
  cold:   { label: 'Saw pricing',  tone: 'info',    blurb: 'Reached pricing or paywall but didn\'t open checkout' },
  trying: { label: 'Trying',       tone: 'info',    blurb: 'Used the studio at least once' },
  ghost:  { label: 'Ghost',        tone: 'muted',   blurb: 'Signed up, never traced, never saw pricing — investigate why' },
};

export function userStage(u) {
  if (u.is_paid) return 'paid';
  if (u.first_checkout_at) return 'warm';
  if (u.first_paywall_at || u.first_pricing_at) return 'cold';
  if ((u.trace_sessions ?? 0) > 0) return 'trying';
  return 'ghost';
}

// Friendly labels for the `current_page` enum the client emits. Keep this
// list in sync with the strings passed to usePresence(...) and the literal
// 'trace' written by heartbeat_trace_run on the server.
export const PAGE_LABEL = {
  upload:    'Upload',
  trace:     'Tracing',
  account:   'Account',
  pricing:   'Pricing',
  checkout:  'Checkout',
  live:      'Live preview',
  admin:     'Admin',
};

// Heartbeat is the live "in the app right now" signal. last_sign_in_at is
// Supabase's stamp on every successful auth — the right fallback for users
// who haven't pinged the heartbeat (e.g. pre-dated the column).
//
// When the user is online, prefer the rich "what are they doing" label
// over the generic "In the app now". Tracing shows the image name in
// quotes; other pages just show the page label.
export function lastSeenLabel(u, online) {
  if (online) {
    // Only claim "Tracing X" when the trace heartbeat is fresh — a stale
    // current_page='trace' on the profile (run in flight, no heartbeats
    // for >45s) means the user almost certainly already left. Falls
    // through to the generic "In the app now" so the row doesn't lie.
    if (isTracingNow(u) && u.current_image_label) {
      return `Tracing "${u.current_image_label}"`;
    }
    if (u.current_page && u.current_page !== 'trace' && PAGE_LABEL[u.current_page]) {
      return `On ${PAGE_LABEL[u.current_page]}`;
    }
    return 'In the app now';
  }
  if (u.last_seen_at)     return formatRelative(u.last_seen_at);
  if (u.last_sign_in_at)  return `Signed in ${formatRelative(u.last_sign_in_at)}`;
  return 'never';
}

// Live-trace duration helpers. `lastHeartbeatAt` lets the ticker freeze if the
// user backgrounded the tab (heartbeats stop on visibilitychange, see
// Trace.jsx), so a paused session doesn't tick up forever and mislead ops.
export const HEARTBEAT_FRESH_MS = 90_000;
export const HEARTBEAT_GRACE_MS = 30_000;

export function liveDurationSeconds(startedAt, lastHeartbeatAt) {
  const start = startedAt ? new Date(startedAt).getTime() : NaN;
  if (!Number.isFinite(start)) return 0;
  const heartbeat = lastHeartbeatAt ? new Date(lastHeartbeatAt).getTime() : 0;
  const now = Date.now();
  const cap = (now - heartbeat) < HEARTBEAT_FRESH_MS
    ? now
    : heartbeat + HEARTBEAT_GRACE_MS;
  return Math.max(0, Math.floor((cap - start) / 1000));
}
