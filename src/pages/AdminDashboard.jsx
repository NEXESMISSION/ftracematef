import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { listAllUsers, getUserActivity, getAdminStats } from '../lib/admin.js';
import { friendlyError } from '../lib/errors.js';
import { usePresence } from '../hooks/usePresence.js';
import { PLAN_LABEL } from '../lib/plans.js';
import { ANALYTICS_PROVIDER, ANALYTICS_EMBED_URL } from '../lib/analytics.js';
import { formatDuration, formatRelative as formatTraceRelative } from '../lib/traceStats.js';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';

// Anyone seen pinging the heartbeat within this window is treated as "in the
// app right now". Tab visibility throttles the heartbeat to 60s, so 2 minutes
// gives one missed-tick of slack before the dot drops.
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

// "User is currently tracing" requires the trace_session_runs heartbeat
// (every 30s) to be fresher than this. 45s = one heartbeat interval +
// 15s grace, matching the server-side reconcile threshold.
const TRACE_HEARTBEAT_FRESH_MS = 45 * 1000;

function isTracingNow(u) {
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
function emailLocalPart(email) {
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
function mergeUserGroup(group) {
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
function normalizeUsers(rawUsers) {
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

const STATUS_TONE = {
  active:    'good',
  on_hold:   'warn',
  cancelled: 'neutral',
  expired:   'neutral',
  failed:    'bad',
};

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatRelative(iso) {
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

function formatMoney(cents, currency = 'USD') {
  if (cents == null) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function isOnline(lastSeen) {
  if (!lastSeen) return false;
  const t = new Date(lastSeen).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < ONLINE_WINDOW_MS;
}

// Classify each user by where they got in the funnel. Priority order
// matters — a paid user is paid even if they also hit the paywall once.
// 'ghost' is the catch-all for users who signed up and did literally
// nothing else, which is the most actionable segment to investigate.
const STAGE_DEFS = {
  paid:   { label: 'Paid',         tone: 'good',    blurb: 'Paying customer' },
  warm:   { label: 'Bailed checkout', tone: 'warn', blurb: 'Opened Dodo checkout but didn\'t finish — recoverable lead' },
  cold:   { label: 'Saw pricing',  tone: 'info',    blurb: 'Reached pricing or paywall but didn\'t open checkout' },
  trying: { label: 'Trying',       tone: 'info',    blurb: 'Used the studio at least once' },
  ghost:  { label: 'Ghost',        tone: 'muted',   blurb: 'Signed up, never traced, never saw pricing — investigate why' },
};

function userStage(u) {
  if (u.is_paid) return 'paid';
  if (u.first_checkout_at) return 'warm';
  if (u.first_paywall_at || u.first_pricing_at) return 'cold';
  if ((u.trace_sessions ?? 0) > 0) return 'trying';
  return 'ghost';
}

// Friendly labels for the `current_page` enum the client emits. Keep this
// list in sync with the strings passed to usePresence(...) and the literal
// 'trace' written by heartbeat_trace_run on the server.
const PAGE_LABEL = {
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
function lastSeenLabel(u, online) {
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

/* ─────────────────────────────────────────────────────────────────────── */
/* Per-user activity log (drill-down) */

// Live, second-by-second duration counter for an open trace run.
// `lastHeartbeatAt` lets us freeze the ticker if the user backgrounded the
// tab — heartbeats stop on visibilitychange (see Trace.jsx), so a heartbeat
// older than the visible-tab cadence is the signal that the tab isn't live.
// Without this guard a paused/backgrounded session would tick up forever
// and mislead ops.
const HEARTBEAT_FRESH_MS = 90_000;
const HEARTBEAT_GRACE_MS = 30_000;

function liveDurationSeconds(startedAt, lastHeartbeatAt) {
  const start = startedAt ? new Date(startedAt).getTime() : NaN;
  if (!Number.isFinite(start)) return 0;
  const heartbeat = lastHeartbeatAt ? new Date(lastHeartbeatAt).getTime() : 0;
  const now = Date.now();
  const cap = (now - heartbeat) < HEARTBEAT_FRESH_MS
    ? now
    : heartbeat + HEARTBEAT_GRACE_MS;
  return Math.max(0, Math.floor((cap - start) / 1000));
}

function LiveDuration({ startedAt, lastHeartbeatAt }) {
  const [seconds, setSeconds] = useState(() =>
    liveDurationSeconds(startedAt, lastHeartbeatAt)
  );
  useEffect(() => {
    const id = setInterval(() => {
      setSeconds(liveDurationSeconds(startedAt, lastHeartbeatAt));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt, lastHeartbeatAt]);
  return <>{formatDuration(seconds)}</>;
}

function Timeline({ activity, journey }) {
  // Merge events from four sources into a single chronological feed —
  // operator scans top-to-bottom, no need to remember which silo holds what.
  // `journey` items are synthesized client-side from the user record (signup
  // landing, first pricing/paywall/checkout) — server doesn't ship them on
  // the activity endpoint since they live as columns on the user row.
  const items = useMemo(() => {
    if (!activity) return [];
    const merged = [...(journey ?? [])];
    for (const s of activity.sub_history ?? []) {
      merged.push({
        kind:   'sub',
        at:     s.created_at ?? s.updated_at,
        title:  `Subscription · ${s.plan ?? '—'} · ${s.status ?? '—'}`,
        detail: [
          s.amount_cents != null ? formatMoney(s.amount_cents, s.currency) : null,
          s.current_period_end ? `expires ${formatDate(s.current_period_end)}` : null,
          s.cancel_at_next_billing_date ? 'pending cancel' : null,
          s.dodo_subscription_id ? `sub ${s.dodo_subscription_id.slice(-10)}` : null,
        ].filter(Boolean).join(' · '),
      });
      if (s.cancelled_at) {
        merged.push({
          kind:   'sub',
          at:     s.cancelled_at,
          title:  `Cancelled · ${s.plan ?? '—'}`,
          detail: s.dodo_subscription_id ? `sub ${s.dodo_subscription_id.slice(-10)}` : '',
        });
      }
    }
    for (const e of activity.events ?? []) {
      merged.push({
        kind:   e.processed === false ? 'event-bad' : 'event',
        at:     e.created_at,
        title:  `Webhook · ${e.event_type}`,
        detail: [
          e.amount != null ? formatMoney(e.amount, e.currency) : null,
          e.status,
          e.payment_id ? `pay ${e.payment_id.slice(-10)}` : null,
          e.subscription_id ? `sub ${e.subscription_id.slice(-10)}` : null,
          e.error_message ? `error: ${e.error_message}` : null,
        ].filter(Boolean).join(' · '),
      });
    }
    for (const s of activity.sign_ins ?? []) {
      merged.push({
        kind:   'auth',
        at:     s.created_at,
        title:  `Auth · ${s.action}`,
        detail: s.ip_address ? `ip ${s.ip_address}` : '',
      });
    }
    // Page-visit log — every route the user landed on, deduped server-side
    // for 30s windows. Reads as the user's literal navigation path top-
    // to-bottom in the merged feed.
    for (const v of activity.page_visits ?? []) {
      const pageLabel = PAGE_LABEL[v.page] ?? v.page;
      merged.push({
        kind:   'visit',
        at:     v.visited_at,
        title:  `Visited · ${pageLabel}`,
        detail: v.image_label ? `"${v.image_label}"` : null,
      });
    }
    // One row per tracing session — the operator's "what did they actually
    // do" feed. Active runs (ended_at is null) get a live ticker; closed
    // runs show the recorded duration.
    for (const r of activity.trace_runs ?? []) {
      const active = !r.ended_at;
      merged.push({
        kind:  active ? 'trace-active' : 'trace',
        at:    r.started_at,
        title: active
          ? `Tracing "${r.image_label ?? '—'}" · live`
          : `Trace · "${r.image_label ?? '—'}"`,
        // detailNode is rendered as JSX when present; falls through to
        // detail string for plain text rows. Active runs get the ticker.
        detailNode: active
          ? (
              <span className="admin-timeline-live">
                <LiveDuration
                  startedAt={r.started_at}
                  lastHeartbeatAt={r.last_heartbeat_at}
                />
              </span>
            )
          : null,
        detail: active
          ? null
          : [
              formatDuration(r.duration_seconds ?? 0),
              r.closed_reason && r.closed_reason !== 'client_end'
                ? `closed: ${r.closed_reason}`
                : null,
            ].filter(Boolean).join(' · '),
      });
    }
    return merged
      .filter((m) => m.at)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [activity, journey]);

  if (!activity) return null;
  if (items.length === 0) {
    return <p className="admin-timeline-empty">No activity recorded yet.</p>;
  }

  return (
    <ol className="admin-timeline">
      {items.map((item, i) => (
        <li key={i} className={`admin-timeline-item admin-timeline-${item.kind}`}>
          <span className="admin-timeline-dot" aria-hidden="true" />
          <div className="admin-timeline-body">
            <div className="admin-timeline-row">
              <span className="admin-timeline-title">{item.title}</span>
              <span className="admin-timeline-when" title={formatDateTime(item.at)}>
                {formatRelative(item.at)}
              </span>
            </div>
            {item.detailNode
              ? <div className="admin-timeline-detail">{item.detailNode}</div>
              : item.detail
                ? <div className="admin-timeline-detail">{item.detail}</div>
                : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Stats panel — server-side rollup of funnel, revenue, activity, top users,
   and at-risk paying customers. The per-user list below answers "who?";
   this panel answers "how's the business doing?". */

function formatMoneyCents(cents, currency = 'USD') {
  if (cents == null) return '—';
  const n = Number(cents);
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: n >= 100_00 ? 0 : 2,
    }).format(n / 100);
  } catch {
    return `$${(n / 100).toFixed(2)}`;
  }
}

function pct(part, whole) {
  if (!whole) return '0%';
  const v = (part / whole) * 100;
  if (v >= 10)  return `${Math.round(v)}%`;
  if (v >= 1)   return `${v.toFixed(1)}%`;
  return `${v.toFixed(2)}%`;
}

// Tiny inline bar chart — pure SVG, no chart library. 14 days × 2 series
// (signups + tracings) stacked vertically with a shared y-axis. Hover tip
// uses native title attribute so we don't need a tooltip layer.
function ActivitySparkline({ days }) {
  const data = days ?? [];
  if (data.length === 0) {
    return <div className="admin-stats-empty">No activity yet.</div>;
  }
  const max = Math.max(
    1,
    ...data.map((d) => Math.max(d.signups || 0, d.tracings || 0)),
  );
  const W = 280, H = 90, pad = 4;
  const slot = (W - pad * 2) / data.length;
  const barW = Math.max(2, slot * 0.36);
  const yFor = (n) => H - pad - (n / max) * (H - pad * 2);
  return (
    <div className="admin-stats-chart-wrap">
      <div className="admin-stats-chart-legend">
        <span><span className="admin-stats-swatch admin-stats-swatch-tracings" /> Tracings</span>
        <span><span className="admin-stats-swatch admin-stats-swatch-signups" /> Signups</span>
      </div>
      <svg
        className="admin-stats-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="14-day activity"
      >
        {data.map((d, i) => {
          const xCenter = pad + slot * (i + 0.5);
          const xT = xCenter - barW - 1;
          const xS = xCenter + 1;
          const yT = yFor(d.tracings || 0);
          const yS = yFor(d.signups || 0);
          const title = `${d.date} — ${d.tracings || 0} tracings, ${d.signups || 0} signups, ${d.paid || 0} paid`;
          return (
            <g key={d.date}>
              <title>{title}</title>
              <rect
                className="admin-stats-bar admin-stats-bar-tracings"
                x={xT} y={yT}
                width={barW} height={Math.max(0, H - pad - yT)}
              />
              <rect
                className="admin-stats-bar admin-stats-bar-signups"
                x={xS} y={yS}
                width={barW} height={Math.max(0, H - pad - yS)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function FunnelPanel({ funnel }) {
  if (!funnel) return null;
  const steps = [
    { key: 'signed_up',      label: 'Signed up',      n: funnel.signed_up      ?? 0 },
    { key: 'opened_studio',  label: 'Opened studio',  n: funnel.opened_studio  ?? 0 },
    { key: 'used_trial',     label: 'Used a session', n: funnel.used_trial     ?? 0 },
    { key: 'currently_paid', label: 'Paying now',     n: funnel.currently_paid ?? 0 },
  ];
  const top = steps[0].n || 1;
  return (
    <div className="admin-stats-funnel">
      {steps.map((s, i) => {
        const prev = i === 0 ? null : steps[i - 1].n;
        return (
          <div key={s.key} className="admin-stats-funnel-step">
            <div className="admin-stats-funnel-bar">
              <div
                className="admin-stats-funnel-fill"
                style={{ width: `${Math.max(2, (s.n / top) * 100)}%` }}
              />
              <span className="admin-stats-funnel-label">{s.label}</span>
              <span className="admin-stats-funnel-count">{s.n}</span>
            </div>
            <div className="admin-stats-funnel-meta">
              {prev != null && (
                <span title={`vs previous step`}>
                  {pct(s.n, prev)} of {steps[i - 1].label.toLowerCase()}
                </span>
              )}
              {i === steps.length - 1 && top > 0 && (
                <span className="admin-stats-funnel-overall" title="Overall conversion">
                  · {pct(s.n, top)} overall
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Single source of truth for the stats + webhook-health rollup. Called at
// the page level so the WebhookHealthPanel can stay visible across tab
// switches without remounting the fetch.
function useAdminMeta() {
  const [stats, setStats]   = useState(null);
  const [health, setHealth] = useState(null);
  const [error, setError]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getAdminStats();
        if (!cancelled) {
          setStats(data.stats);
          setHealth(data.webhook_health);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(friendlyError(e, 'Could not load stats.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return { stats, health, error, loading };
}

function StatsPanel({ stats, error, loading }) {

  if (loading && !stats) {
    return (
      <section className="admin-stats">
        <header className="admin-stats-head">
          <h2>Business stats</h2>
        </header>
        <div className="admin-stats-loading">
          <span className="admin-spinner" aria-hidden="true" />
          <span>Loading stats…</span>
        </div>
      </section>
    );
  }
  if (error) {
    return (
      <section className="admin-stats">
        <header className="admin-stats-head">
          <h2>Business stats</h2>
        </header>
        <p className="admin-error" style={{ margin: 12 }}>{error}</p>
      </section>
    );
  }
  if (!stats) return null;

  const { funnel, revenue, activity, engagement, top_users, at_risk } = stats;
  const planEntries = Object.entries(revenue?.plans ?? {});

  return (
    <section className="admin-stats" aria-labelledby="admin-stats-title">
      <header className="admin-stats-head">
        <h2 id="admin-stats-title">Business stats</h2>
        <span className="admin-stats-when">
          updated {stats.computed_at ? formatTraceRelative(stats.computed_at) : 'just now'}
        </span>
      </header>

      <div className="admin-stats-grid">
        {/* ── Revenue tile ───────────────────────────────────────────── */}
        <div className="admin-stats-card admin-stats-revenue">
          <div className="admin-stats-card-head">
            <h3>Revenue</h3>
          </div>
          <div className="admin-stats-revenue-headline">
            <div>
              <span className="admin-stats-revenue-value">{formatMoneyCents(revenue?.mrr_cents)}</span>
              <span className="admin-stats-revenue-label">/ month (MRR)</span>
            </div>
            <div className="admin-stats-revenue-secondary">
              <span>{formatMoneyCents(revenue?.lifetime_revenue_cents)} lifetime</span>
            </div>
          </div>
          <dl className="admin-stats-mini">
            <div><dt>New paid · today</dt>     <dd>{revenue?.paid_today      ?? 0}</dd></div>
            <div><dt>New paid · week</dt>      <dd>{revenue?.paid_this_week  ?? 0}</dd></div>
            <div><dt>New paid · month</dt>     <dd>{revenue?.paid_this_month ?? 0}</dd></div>
          </dl>
          {planEntries.length > 0 && (
            <div className="admin-stats-plans">
              {planEntries.map(([plan, n]) => (
                <span key={plan} className="admin-stats-plan-pill">
                  <strong>{n}</strong> {PLAN_LABEL[plan] ?? plan}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Funnel tile ───────────────────────────────────────────── */}
        <div className="admin-stats-card">
          <div className="admin-stats-card-head">
            <h3>Conversion funnel</h3>
          </div>
          <FunnelPanel funnel={funnel} />
        </div>

        {/* ── Activity / engagement tile ────────────────────────────── */}
        <div className="admin-stats-card">
          <div className="admin-stats-card-head">
            <h3>Activity · last 14 days</h3>
          </div>
          <ActivitySparkline days={activity} />
          <dl className="admin-stats-mini">
            <div>
              <dt>Active · 24h</dt>
              <dd>{engagement?.active_24h ?? 0}</dd>
            </div>
            <div>
              <dt>Active · 7d</dt>
              <dd>{engagement?.active_7d ?? 0}</dd>
            </div>
            <div>
              <dt>Tracings · 24h</dt>
              <dd>{engagement?.tracings_24h ?? 0}</dd>
            </div>
            <div>
              <dt>Time traced · 7d</dt>
              <dd>{formatDuration(engagement?.tracing_seconds_7d ?? 0)}</dd>
            </div>
          </dl>
        </div>

        {/* ── Top users tile ────────────────────────────────────────── */}
        <div className="admin-stats-card">
          <div className="admin-stats-card-head">
            <h3>Top tracers</h3>
          </div>
          {top_users?.length ? (
            <ol className="admin-stats-list">
              {top_users.map((u) => (
                <li key={u.id}>
                  <span className="admin-stats-list-id">
                    {u.email ?? '—'}
                    {u.is_paid && <span className="admin-stats-list-tag">paid</span>}
                  </span>
                  <span className="admin-stats-list-meta">
                    {formatDuration(u.total_trace_seconds)}
                    {' · '}
                    {u.trace_sessions} sess
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="admin-stats-empty">No tracings yet.</div>
          )}
        </div>

        {/* ── At-risk tile ──────────────────────────────────────────── */}
        <div className="admin-stats-card admin-stats-card-wide">
          <div className="admin-stats-card-head">
            <h3>At risk · paid + idle 14+ days</h3>
            <span className="admin-stats-card-meta">{at_risk?.length ?? 0}</span>
          </div>
          {at_risk?.length ? (
            <ul className="admin-stats-list admin-stats-list-risk">
              {at_risk.map((u) => (
                <li key={u.id}>
                  <span className="admin-stats-list-id">
                    {u.email ?? '—'}
                    <span className="admin-stats-list-tag">{PLAN_LABEL[u.plan] ?? u.plan}</span>
                  </span>
                  <span className="admin-stats-list-meta">
                    {u.last_seen_at
                      ? `idle ${u.days_since_seen}d`
                      : 'never opened'}
                    {u.current_period_end && (
                      <> · renews {new Date(u.current_period_end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="admin-stats-empty">All paying customers active. 🎉</div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Acquisition — group signups by signup_source (set by /r/:source clicks).
   Computed entirely client-side from the user list we already fetched, so
   there's no extra round-trip when this panel mounts. Rows sort by signup
   count descending so the channel sending the most volume is on top.    */

function AcquisitionPanel({ users }) {
  const rows = useMemo(() => {
    if (!Array.isArray(users)) return [];
    const bySource = new Map();
    let unattributed = 0;
    let unattributedPaid = 0;
    for (const u of users) {
      const src = (u?.signup_source || '').trim();
      if (!src) {
        unattributed += 1;
        if (u?.is_paid) unattributedPaid += 1;
        continue;
      }
      const cur = bySource.get(src) ?? { source: src, signups: 0, paid: 0 };
      cur.signups += 1;
      if (u.is_paid) cur.paid += 1;
      bySource.set(src, cur);
    }
    const list = Array.from(bySource.values()).sort((a, b) => b.signups - a.signups);
    // Always pin "(direct / unknown)" at the bottom — it's the catch-all
    // bucket for users who came in before /r/:source existed, typed the
    // URL directly, or arrived via a channel we haven't tagged. Useful as
    // a sanity check ("what % of signups are still unattributed?") but
    // never the lead row.
    if (unattributed > 0) {
      list.push({
        source: '(direct / unknown)',
        signups: unattributed,
        paid: unattributedPaid,
        muted: true,
      });
    }
    return list;
  }, [users]);

  const totals = rows.reduce(
    (acc, r) => ({ signups: acc.signups + r.signups, paid: acc.paid + r.paid }),
    { signups: 0, paid: 0 },
  );

  return (
    <section className="admin-stats" aria-labelledby="admin-acq-title">
      <header className="admin-stats-head">
        <h2 id="admin-acq-title">Acquisition by source</h2>
        <span className="admin-stats-when">
          share <code>tracemate.art/r/&lt;source&gt;</code> or one of the
          aliases (<code>/tiktok</code>, <code>/reddit</code>, <code>/yt</code>,
          <code>/ig</code>, <code>/x</code>, <code>/threads</code>, <code>/tt</code>)
          and the slug shows up here. Add <code>?c=&lt;label&gt;</code> for
          per-post breakdowns.
        </span>
      </header>
      {rows.length === 0 ? (
        <div className="admin-stats-empty" style={{ padding: 16 }}>
          No signups yet — share a tagged link to start tracking.
        </div>
      ) : (
        <div className="admin-acq-table" role="table">
          <div className="admin-acq-row admin-acq-head" role="row">
            <span role="columnheader">Source</span>
            <span role="columnheader">Signups</span>
            <span role="columnheader">Paid</span>
            <span role="columnheader">Conv.</span>
          </div>
          {rows.map((r) => {
            const conv = r.signups > 0 ? Math.round((r.paid / r.signups) * 100) : 0;
            return (
              <div
                key={r.source}
                className={`admin-acq-row ${r.muted ? 'admin-acq-row-muted' : ''}`}
                role="row"
              >
                <span className="admin-acq-source" role="cell">{r.source}</span>
                <span role="cell">{r.signups}</span>
                <span role="cell">{r.paid}</span>
                <span role="cell">{conv}%</span>
              </div>
            );
          })}
          <div className="admin-acq-row admin-acq-foot" role="row">
            <span role="cell"><strong>Total</strong></span>
            <span role="cell"><strong>{totals.signups}</strong></span>
            <span role="cell"><strong>{totals.paid}</strong></span>
            <span role="cell">
              <strong>
                {totals.signups > 0 ? Math.round((totals.paid / totals.signups) * 100) : 0}%
              </strong>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Exit-survey rollup. Counts answers from users who reached the post-trial
   survey before the paywall — the "where did they come from" + "did they
   like it" pair lets the operator read sentiment per acquisition channel.
   Pure client-side aggregation off the same users array, no extra fetch. */

const SURVEY_FEELING_LABEL = {
  loved:    { label: 'Loved it',    emoji: '🤩', tone: 'good' },
  liked:    { label: 'Liked it',    emoji: '🙂', tone: 'good' },
  mixed:    { label: 'Mixed',       emoji: '😐', tone: 'neutral' },
  disliked: { label: "Didn't love", emoji: '😕', tone: 'warn' },
};
const SURVEY_FEELING_ORDER = ['loved', 'liked', 'mixed', 'disliked'];

// Friendly labels for the source IDs the client sends (mirrored in the
// record_exit_survey whitelist). Anything not listed here falls back to
// the raw id — happens for legacy values or migrations that lag the UI.
const SURVEY_SOURCE_LABEL = {
  ai:        'AI assistant',
  tiktok:    'TikTok',
  instagram: 'Instagram',
  youtube:   'YouTube',
  reddit:    'Reddit',
  twitter:   'X / Twitter',
  facebook:  'Facebook',
  pinterest: 'Pinterest',
  threads:   'Threads',
  linkedin:  'LinkedIn',
  discord:   'Discord',
  google:    'Search engine',
  blog:      'Blog / article',
  podcast:   'Podcast',
  app_store: 'App store',
  friend:    'A friend',
  other:     'Somewhere else',
};
const labelForSource = (id) => SURVEY_SOURCE_LABEL[id] ?? id;

function SurveyPanel({ users }) {
  const { rows, totals, notes } = useMemo(() => {
    if (!Array.isArray(users)) {
      return { rows: [], totals: { responses: 0, eligible: 0 }, notes: [] };
    }
    // Eligible = users who have ever reached /trace and therefore had the
    // chance to see the survey. Proxy: free_sessions_used > 0 (any free
    // user who entered the studio at least once) OR is_paid (paid users
    // can hit /trace anytime). Total users isn't right as a denominator
    // because ghosts who signed up and never opened /trace genuinely
    // never saw the gate, so counting them would make the rate look
    // artificially low.
    let eligible = 0;
    let responses = 0;
    const bySource = new Map();
    const byFeeling = Object.fromEntries(SURVEY_FEELING_ORDER.map((f) => [f, 0]));
    const noteList = [];

    for (const u of users) {
      const reachedTrace = !!u?.is_paid || (Number(u?.free_sessions_used ?? 0) > 0);
      if (reachedTrace) eligible += 1;
      if (!u?.exit_survey_at) continue;
      responses += 1;

      const src = (u.exit_survey_source || 'other').trim();
      const cur = bySource.get(src) ?? { source: src, total: 0, loved: 0, liked: 0, mixed: 0, disliked: 0 };
      cur.total += 1;
      const feeling = (u.exit_survey_feeling || '').trim();
      if (feeling in cur) cur[feeling] += 1;
      bySource.set(src, cur);

      if (feeling in byFeeling) byFeeling[feeling] += 1;

      if (u.exit_survey_note) {
        noteList.push({
          id: u.id,
          email: u.email,
          display_name: u.display_name,
          source: src,
          feeling,
          note: u.exit_survey_note,
          at: u.exit_survey_at,
        });
      }
    }

    const list = Array.from(bySource.values()).sort((a, b) => b.total - a.total);
    // Newest notes first — fresh feedback is the most actionable.
    noteList.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return {
      rows: list,
      totals: { responses, eligible, byFeeling },
      notes: noteList,
    };
  }, [users]);

  const responseRate = totals.eligible > 0
    ? Math.round((totals.responses / totals.eligible) * 100)
    : 0;

  return (
    <section className="admin-stats" aria-labelledby="admin-survey-title">
      <header className="admin-stats-head">
        <h2 id="admin-survey-title">Pre-trace survey</h2>
        <span className="admin-stats-when">
          required gate on /trace for every user — paid, first-time free,
          and trial-used free alike. Pairs source attribution with sentiment
          so you can read each channel's vibe at a glance.
        </span>
      </header>

      {totals.responses === 0 ? (
        <div className="admin-stats-empty" style={{ padding: 16 }}>
          No survey responses yet — the gate fires the next time any user
          opens /trace.
        </div>
      ) : (
        <>
          <div className="admin-survey-summary">
            <div className="admin-survey-summary-cell">
              <span className="admin-survey-summary-num">{totals.responses}</span>
              <span className="admin-survey-summary-lbl">responses</span>
            </div>
            <div className="admin-survey-summary-cell">
              <span className="admin-survey-summary-num">{responseRate}%</span>
              <span className="admin-survey-summary-lbl">
                of {totals.eligible} eligible
              </span>
            </div>
            {SURVEY_FEELING_ORDER.map((f) => {
              const meta = SURVEY_FEELING_LABEL[f];
              const count = totals.byFeeling?.[f] ?? 0;
              const pct = totals.responses > 0
                ? Math.round((count / totals.responses) * 100)
                : 0;
              return (
                <div key={f} className={`admin-survey-summary-cell admin-survey-summary-${meta.tone}`}>
                  <span className="admin-survey-summary-num">
                    <span aria-hidden="true">{meta.emoji}</span> {count}
                  </span>
                  <span className="admin-survey-summary-lbl">{meta.label} · {pct}%</span>
                </div>
              );
            })}
          </div>

          <div className="admin-acq-table" role="table" style={{ marginTop: 18 }}>
            <div className="admin-acq-row admin-acq-head" role="row">
              <span role="columnheader">Source</span>
              <span role="columnheader">Total</span>
              <span role="columnheader">Loved</span>
              <span role="columnheader">Liked</span>
              <span role="columnheader">Mixed</span>
              <span role="columnheader">Didn't love</span>
            </div>
            {rows.map((r) => (
              <div key={r.source} className="admin-acq-row" role="row">
                <span className="admin-acq-source" role="cell">{labelForSource(r.source)}</span>
                <span role="cell">{r.total}</span>
                <span role="cell">{r.loved}</span>
                <span role="cell">{r.liked}</span>
                <span role="cell">{r.mixed}</span>
                <span role="cell">{r.disliked}</span>
              </div>
            ))}
          </div>

          {notes.length > 0 && (
            <div className="admin-survey-notes">
              <h3 className="admin-survey-notes-title">Recent free-form notes</h3>
              <ul className="admin-survey-notes-list">
                {notes.slice(0, 8).map((n) => {
                  const meta = SURVEY_FEELING_LABEL[n.feeling] ?? null;
                  return (
                    <li key={n.id} className="admin-survey-note">
                      <div className="admin-survey-note-head">
                        <span className="admin-survey-note-emoji" aria-hidden="true">
                          {meta?.emoji ?? '💬'}
                        </span>
                        <span className="admin-survey-note-who">
                          {n.display_name || n.email || 'unknown'}
                        </span>
                        <span className="admin-survey-note-meta">
                          {labelForSource(n.source)} · {meta?.label ?? n.feeling} · {formatRelative(n.at)}
                        </span>
                      </div>
                      <p className="admin-survey-note-body">{n.note}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Webhook health — stuck-event count + recent list. Mounted above the
   tab nav so anything stuck for >24h is impossible to miss regardless of
   which tab the operator is currently on.                                */

function fmtAgo(secs) {
  if (!Number.isFinite(secs) || secs <= 0) return '0s';
  if (secs < 60)     return `${Math.round(secs)}s`;
  if (secs < 3600)   return `${Math.round(secs / 60)}m`;
  if (secs < 86400)  return `${Math.round(secs / 3600)}h`;
  return `${Math.round(secs / 86400)}d`;
}

function WebhookHealthPanel({ data }) {
  const [open, setOpen] = useState(false);
  const stuck     = Number(data?.stuck_count ?? 0);
  const stuck24h  = Number(data?.stuck_24h_count ?? 0);
  const oldest    = Number(data?.oldest_stuck_age_secs ?? 0);
  const recent    = Array.isArray(data?.recent) ? data.recent : [];

  if (stuck === 0) {
    return (
      <section className="admin-webhooks admin-webhooks-clean" aria-label="Webhook health">
        <span className="admin-webhooks-dot" aria-hidden="true" />
        <span className="admin-webhooks-headline">Webhooks healthy</span>
        <span className="admin-webhooks-sub">no stuck events in the last 14 days</span>
      </section>
    );
  }

  const tone = stuck24h > 0 ? 'admin-webhooks-bad' : 'admin-webhooks-warn';
  return (
    <section className={`admin-webhooks ${tone}`} aria-label="Webhook health">
      <button
        type="button"
        className="admin-webhooks-summary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="admin-webhooks-dot" aria-hidden="true" />
        <span className="admin-webhooks-headline">
          {stuck} stuck webhook{stuck === 1 ? '' : 's'}
          {stuck24h > 0 && <em> · {stuck24h} over 24h</em>}
        </span>
        <span className="admin-webhooks-sub">
          oldest {fmtAgo(oldest)} ago · {open ? 'hide' : 'view'}
        </span>
      </button>
      {open && (
        <ol className="admin-webhooks-list">
          {recent.map((r, i) => (
            <li key={r.webhook_id || i} className="admin-webhooks-row">
              <div className="admin-webhooks-row-head">
                <span className="admin-webhooks-event">{r.event_type ?? '—'}</span>
                <span className="admin-webhooks-when" title={r.created_at}>
                  {formatRelative(r.created_at)} · {r.attempts ?? 0} attempts
                </span>
              </div>
              {(r.subscription_id || r.payment_id || r.customer_email) && (
                <div className="admin-webhooks-meta">
                  {r.customer_email && <span>{r.customer_email}</span>}
                  {r.amount && r.currency && <span>{r.amount} {r.currency}</span>}
                  {r.subscription_id && <span>sub {String(r.subscription_id).slice(-10)}</span>}
                  {r.payment_id && <span>pay {String(r.payment_id).slice(-10)}</span>}
                </div>
              )}
              {r.error_message && (
                <div className="admin-webhooks-error">{r.error_message}</div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Traffic panel — embeds the Plausible/Umami shared dashboard */

function TrafficPanel() {
  const providerLabel =
    ANALYTICS_PROVIDER === 'plausible'   ? 'Plausible'   :
    ANALYTICS_PROVIDER === 'umami'       ? 'Umami'       :
    ANALYTICS_PROVIDER === 'goatcounter' ? 'GoatCounter' :
    null;

  // No provider configured at build time → friendly setup prompt instead of
  // a broken iframe. Operator just needs to set the env vars and rebuild.
  if (!ANALYTICS_EMBED_URL) {
    return (
      <section className="admin-traffic admin-traffic-empty">
        <header className="admin-traffic-head">
          <h2>Traffic</h2>
          <span className="admin-traffic-status">not configured</span>
        </header>
        <p className="admin-traffic-help">
          Set <code>VITE_PLAUSIBLE_DOMAIN</code> + <code>VITE_PLAUSIBLE_EMBED_URL</code>{' '}
          (or the <code>VITE_UMAMI_*</code> / <code>VITE_GOATCOUNTER_URL</code>{' '}
          equivalents) in your environment and rebuild to see your visitor
          dashboard here.
        </p>
      </section>
    );
  }

  // GoatCounter's hosted dashboard sends `X-Frame-Options: DENY`, so the
  // iframe path always shows "refused to connect". Render a clean call-to-
  // action that opens the live dashboard in a new tab instead.
  if (ANALYTICS_PROVIDER === 'goatcounter') {
    return (
      <section className="admin-traffic admin-traffic-cta">
        <header className="admin-traffic-head">
          <h2>Traffic</h2>
          <span className="admin-traffic-status">{providerLabel}</span>
        </header>
        <div className="admin-traffic-cta-body">
          <p>
            GoatCounter's hosted dashboard refuses to be embedded — open the
            live stats in a new tab.
          </p>
          <a
            href={ANALYTICS_EMBED_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="admin-traffic-cta-btn"
          >
            Open analytics ↗
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-traffic">
      <header className="admin-traffic-head">
        <h2>Traffic</h2>
        {providerLabel && (
          <a
            className="admin-traffic-status"
            href={ANALYTICS_EMBED_URL.split('?')[0]}
            target="_blank"
            rel="noopener noreferrer"
          >
            {providerLabel} ↗
          </a>
        )}
      </header>
      <iframe
        title="Visitor analytics"
        src={ANALYTICS_EMBED_URL}
        loading="lazy"
        scrolling="no"
        className="admin-traffic-frame"
      />
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Trace stats tiles — mirrors the /account scrapbook tiles, but compact.
   Data is already on the user row (admin-list-users selects the 4 columns),
   so no extra fetch is needed when the activity drawer opens. */

function TraceStatsTiles({ user }) {
  const tiles = [
    {
      key: 'time',
      label: 'Time traced',
      value: formatDuration(user.total_trace_seconds || 0),
    },
    {
      key: 'sessions',
      label: 'Sessions',
      value: user.trace_sessions || 0,
    },
    {
      key: 'last',
      label: 'Last session',
      value: user.last_trace_at ? formatTraceRelative(user.last_trace_at) : 'never',
    },
    {
      key: 'member',
      label: 'Member since',
      value: user.created_at ? formatDate(user.created_at) : '—',
    },
  ];
  return (
    <ul className="admin-trace-tiles">
      {tiles.map((t) => (
        <li key={t.key} className="admin-trace-tile">
          <span className="admin-trace-tile-label">{t.label}</span>
          <span className="admin-trace-tile-value">{t.value}</span>
        </li>
      ))}
    </ul>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */


function ActivityPanel({ user }) {
  const userId = user?.id;
  const [activity, setActivity] = useState(null);
  const [error, setError]       = useState(null);

  useEffect(() => {
    let cancelled = false;
    setActivity(null); setError(null);
    getUserActivity(userId)
      .then((d) => { if (!cancelled) setActivity(d); })
      .catch((e) => { if (!cancelled) setError(friendlyError(e, 'Could not load activity.')); });
    return () => { cancelled = true; };
  }, [userId]);

  // Synthesize journey events client-side from the user record. These
  // columns ride along on the list-users response, so no extra fetch.
  // Mounted alongside the server-fetched timeline below — the Timeline
  // component merges everything by timestamp.
  const journey = useMemo(() => {
    if (!user) return [];
    const out = [];
    if (user.created_at) {
      const where = user.signup_landing ? ` (from /${user.signup_landing})` : '';
      // Compose the detail line out of the strongest available signal.
      // signup_source is first-touch attribution from the /r/:source link
      // they clicked; signup_referrer is the unreliable document.referrer
      // fallback. Prefer the former; show both when both exist.
      const bits = [];
      if (user.signup_source) {
        bits.push(`source: ${user.signup_source}${user.signup_campaign ? ` / ${user.signup_campaign}` : ''}`);
      }
      if (user.signup_referrer) {
        bits.push(`referrer: ${user.signup_referrer.slice(0, 100)}`);
      }
      out.push({
        kind: 'journey-signup',
        at: user.created_at,
        title: `Signed up${where}`,
        detail: bits.length ? bits.join(' · ') : null,
      });
    }
    if (user.first_pricing_at) {
      out.push({
        kind: 'journey',
        at: user.first_pricing_at,
        title: 'First viewed pricing',
        detail: null,
      });
    }
    if (user.first_paywall_at) {
      out.push({
        kind: 'journey-warn',
        at: user.first_paywall_at,
        title: 'Hit the paywall',
        detail: null,
      });
    }
    if (user.first_checkout_at) {
      out.push({
        kind: 'journey-warm',
        at: user.first_checkout_at,
        title: 'Opened Dodo checkout',
        detail: null,
      });
    }
    return out;
  }, [user]);

  return (
    <div className="admin-activity">
      {!activity && !error && (
        <div className="admin-activity-loading">
          <span className="admin-spinner" aria-hidden="true" />
          <span>Loading activity…</span>
        </div>
      )}
      {error && <p className="admin-error">{error}</p>}
      {activity && <Timeline activity={activity} journey={journey} />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

export default function AdminDashboard() {
  const { user, signOut } = useAuth();
  usePresence('admin');
  const [users, setUsers]       = useState(null);
  const [error, setError]       = useState(null);
  // Filter narrows the visible set; sort orders what's left. Both default to
  // the broadest, least-opinionated value so a fresh dashboard render matches
  // what the operator saw before these controls existed.
  const [filter, setFilter]     = useState('all');     // 'all' | 'online' | 'tracing' | 'paid' | 'unpaid'
  const [sort, setSort]         = useState('newest');  // 'newest' | 'active' | 'time' | 'sessions'
  const [query, setQuery]       = useState('');
  const [tick, setTick]         = useState(0);       // re-render every 30s for "online" decay
  const [expanded, setExpanded] = useState(null);    // currently-expanded user_id
  // Top-level view toggle — the user list is the workhorse, stats and traffic
  // panels are reference data. Tabbing them keeps the dashboard from being a
  // wall of charts every time you open it.
  const [view, setView]         = useState('users'); // 'users' | 'stats' | 'traffic'

  // Stats + webhook health share one fetch so the health banner stays mounted
  // across tab switches without re-firing the rollup.
  const meta = useAdminMeta();

  // Load function exposed at component scope so both the auto-refresh
  // timer AND the pull-to-refresh handler can call it. Throws on
  // failure so pull-to-refresh's spinner snaps off cleanly.
  const loadUsers = useCallback(async () => {
    try {
      const items = await listAllUsers();
      // Normalize once on the way in: dedupe by canonical local-part so
      // counts, the filter list, and the rendered cards all see the same
      // collapsed set. Same person across providers (gmail + hotmail) is
      // surfaced as one row with an alias chip.
      setUsers(normalizeUsers(items));
      setError(null);
    } catch (e) {
      setError(friendlyError(e, 'Could not load users.'));
      throw e;
    }
  }, []);

  // Auto-refresh every 30s while the page is open. Same cadence as the
  // tick used to fade the online dot — one timer drives both.
  useEffect(() => {
    let cancelled = false;
    (async () => { try { await loadUsers(); } catch { /* logged via setError */ } })();
    const id = setInterval(() => {
      if (cancelled) return;
      loadUsers().catch(() => { /* surfaced via setError */ });
      setTick((t) => t + 1);
    }, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [loadUsers]);

  // Lightweight local tick — only re-evaluates the heartbeat-fresh
  // computations against the current data, no network round-trip. Lets
  // a row's "tracing" state flip off as soon as the heartbeat goes
  // stale, instead of waiting up to 30s for the next list refresh.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  // Pull-to-refresh on mobile (PWA): drag down from the top of the page
  // to force a fresh fetch without hunting for the URL bar. Desktop
  // mouse-drag works too — handy for testing.
  const { pullDistance, triggered, isRefreshing, threshold } = usePullToRefresh({
    onRefresh: loadUsers,
    threshold: 70,
  });

  const counts = useMemo(() => {
    if (!users) return { all: 0, paid: 0, unpaid: 0, online: 0, tracing: 0, ghost: 0, cold: 0, warm: 0, trying: 0 };
    // Admins (operator self-views, team test accounts) skew every funnel
    // they appear in. Drop them from every tile so headline numbers reflect
    // real users only. Admins still render in the list with their badge.
    const real = users.filter((u) => !u.is_admin);
    let paid = 0, online = 0, tracing = 0;
    let ghost = 0, cold = 0, warm = 0, trying = 0;
    for (const u of real) {
      if (u.is_paid) paid++;
      if (isOnline(u.last_seen_at)) {
        online++;
        if (isTracingNow(u)) tracing++;
      }
      const stage = userStage(u);
      if      (stage === 'ghost')  ghost++;
      else if (stage === 'cold')   cold++;
      else if (stage === 'warm')   warm++;
      else if (stage === 'trying') trying++;
    }
    void tick;
    return { all: real.length, paid, unpaid: real.length - paid, online, tracing, ghost, cold, warm, trying };
  }, [users, tick]);

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = query.trim().toLowerCase();

    // ── Filter ─────────────────────────────────────────────────────────────
    // Online / Tracing are evaluated against last_seen_at + current_page,
    // both of which are kept fresh by the heartbeat. The 30s reload + tick
    // re-runs this memo so a user dropping offline disappears within ~30s
    // of their heartbeat going stale.
    const matches = users.filter((u) => {
      if (filter === 'paid'    && !u.is_paid) return false;
      if (filter === 'unpaid'  &&  u.is_paid) return false;
      if (['ghost','cold','warm','trying'].includes(filter) && userStage(u) !== filter) return false;
      if (filter === 'online'  && !isOnline(u.last_seen_at)) return false;
      if (filter === 'tracing' && !isTracingNow(u)) return false;
      if (q) {
        const haystack = [
          u.email ?? '',
          u.display_name ?? '',
          ...(Array.isArray(u.aliases) ? u.aliases : []),
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    // ── Sort ───────────────────────────────────────────────────────────────
    // Default is 'newest' which preserves the server's `order by created_at`
    // (the array is already in that order), so we skip the sort entirely
    // when 'newest' is selected — pointless O(n log n) on a stable list.
    if (sort === 'newest') return matches;

    const num = (v) => Number.isFinite(v) ? v : 0;
    const ts  = (v) => v ? new Date(v).getTime() : 0;

    const sorted = matches.slice();
    if (sort === 'active') {
      // Most-recently-online first. Falls back to last_sign_in_at for users
      // who haven't pinged the heartbeat yet.
      sorted.sort((a, b) =>
        ts(b.last_seen_at || b.last_sign_in_at) -
        ts(a.last_seen_at || a.last_sign_in_at)
      );
    } else if (sort === 'time') {
      sorted.sort((a, b) => num(b.total_trace_seconds) - num(a.total_trace_seconds));
    } else if (sort === 'sessions') {
      sorted.sort((a, b) => num(b.trace_sessions) - num(a.trace_sessions));
    }
    return sorted;
  }, [users, filter, query, sort, tick]);

  const toggleExpand = useCallback((id) => {
    setExpanded((cur) => (cur === id ? null : id));
  }, []);

  return (
    <div
      className="admin-shell"
      style={pullDistance > 0 ? { transform: `translateY(${pullDistance}px)`, transition: pullDistance === 0 ? 'transform 200ms ease' : 'none' } : undefined}
    >
      {/* Pull-to-refresh indicator. Sits absolutely above the page; the
          shell itself is translateY-shifted so the user gets the rubber-
          band feel of "pulling the page down to reveal a spinner". */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          className={`admin-ptr ${triggered ? 'is-triggered' : ''} ${isRefreshing ? 'is-refreshing' : ''}`}
          style={{ height: pullDistance, top: -pullDistance }}
          aria-hidden="true"
        >
          <span className="admin-ptr-dot" />
          <span className="admin-ptr-label">
            {isRefreshing ? 'Refreshing…' : triggered ? 'Release to refresh' : 'Pull to refresh'}
          </span>
        </div>
      )}
      <header className="admin-bar">
        <div className="admin-bar-id">
          <span className="admin-bar-tag">ADMIN</span>
          <h1 className="admin-bar-title">Operator dashboard</h1>
        </div>
        <div className="admin-bar-right">
          <span className="admin-bar-me">{user?.email}</span>
          <Link to="/account" className="admin-link">Account</Link>
          <button type="button" className="admin-link admin-link-danger" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="admin-main">
        <section className="admin-summary">
          <div className="admin-summary-card">
            <span className="admin-summary-label">Total users</span>
            <span className="admin-summary-value">{counts.all}</span>
          </div>
          <div className="admin-summary-card admin-summary-card-paid">
            <span className="admin-summary-label">Paid</span>
            <span className="admin-summary-value">{counts.paid}</span>
          </div>
          <div className="admin-summary-card">
            <span className="admin-summary-label">Unpaid</span>
            <span className="admin-summary-value">{counts.unpaid}</span>
          </div>
          <div className="admin-summary-card admin-summary-card-online">
            <span className="admin-summary-dot" aria-hidden="true" />
            <span className="admin-summary-label">Online now</span>
            <span className="admin-summary-value">{counts.online}</span>
          </div>
          <div className="admin-summary-card admin-summary-card-tracing">
            <span className="admin-summary-label">Tracing now</span>
            <span className="admin-summary-value">{counts.tracing}</span>
          </div>
        </section>

        {meta.health && <WebhookHealthPanel data={meta.health} />}

        {/* View tabs — gate the heavy panels behind a click so the user list
            (the day-to-day workhorse) is what loads first. */}
        <nav className="admin-views" role="tablist" aria-label="Dashboard view">
          {[
            { id: 'users',   label: 'Users' },
            { id: 'stats',   label: 'Stats' },
            { id: 'traffic', label: 'Traffic' },
          ].map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              className={`admin-view-tab ${view === v.id ? 'is-active' : ''}`}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </nav>

        {view === 'stats' && (
          <>
            <StatsPanel stats={meta.stats} error={meta.error} loading={meta.loading} />
            <AcquisitionPanel users={users} />
            <SurveyPanel users={users} />
          </>
        )}
        {view === 'traffic' && <TrafficPanel />}

        {view === 'users' && (
          <>
        <section className="admin-controls">
          {/* Filter tabs include live-state filters (Online / Tracing) so the
              operator can zero in on currently-engaged users without having
              to scan the whole list for green dots. Counts are appended to
              each tab as a small subdued number so it's obvious which
              filters will return any results before clicking. */}
          <div className="admin-tabs" role="tablist" aria-label="Filter users">
            {[
              { id: 'all',     label: 'All',     count: counts.all },
              { id: 'online',  label: 'Online',  count: counts.online },
              { id: 'tracing', label: 'Tracing', count: counts.tracing },
              { id: 'paid',    label: 'Paid',    count: counts.paid },
              { id: 'unpaid',  label: 'Unpaid',  count: counts.unpaid },
              // Funnel stages — derived client-side from the journey columns
              // shipped on the user record. Lets the operator zero in on
              // ghosts (signed up, did nothing) or warm leads (bailed during
              // checkout) without scanning the whole list.
              { id: 'ghost',   label: 'Ghost',   count: counts.ghost,  hint: 'Signed up, never traced or saw pricing' },
              { id: 'cold',    label: 'Cold',    count: counts.cold,   hint: 'Saw pricing or paywall, didn\'t open checkout' },
              { id: 'warm',    label: 'Warm',    count: counts.warm,   hint: 'Opened checkout but didn\'t finish' },
              { id: 'trying',  label: 'Trying',  count: counts.trying, hint: 'Used the studio, hasn\'t reached pricing yet' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={filter === t.id}
                className={`admin-tab ${filter === t.id ? 'is-active' : ''}`}
                onClick={() => setFilter(t.id)}
                title={t.hint}
              >
                {t.label}
                <span className="admin-tab-count">{t.count}</span>
              </button>
            ))}
          </div>
          <div className="admin-controls-right">
            {/* Sort is a separate concern from filtering. "Most active" =
                sort by total_trace_seconds desc, "Most sessions" = by
                trace_sessions desc — both surface power users at a glance. */}
            <label className="admin-sort">
              <span className="admin-sort-label">Sort</span>
              <select
                className="admin-sort-select"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                aria-label="Sort users"
              >
                <option value="newest">Recent signup</option>
                <option value="active">Last active</option>
                <option value="time">Most time traced</option>
                <option value="sessions">Most sessions</option>
              </select>
            </label>
            <input
              type="search"
              className="admin-search"
              placeholder="Search email or name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </section>

        {error && <p className="admin-error">{error}</p>}

        {users === null && !error && (
          <div className="admin-loading">
            <span className="admin-spinner" aria-hidden="true" />
            <p>Loading users…</p>
          </div>
        )}

        {users && filtered.length === 0 && (
          <p className="admin-empty">No users match this filter.</p>
        )}

        {users && filtered.length > 0 && (
          <ul className="admin-list">
            {filtered.map((u) => {
              const online    = isOnline(u.last_seen_at);
              const tracing   = isTracingNow(u);
              const tone      = STATUS_TONE[u.status] ?? 'neutral';
              const planLabel = u.plan ? (PLAN_LABEL[u.plan] ?? u.plan) : 'No plan';
              const isOpen    = expanded === u.id;
              const presenceLabel = lastSeenLabel(u, online);
              return (
                <li
                  key={u.id}
                  className={`admin-row ${isOpen ? 'is-open' : ''} ${tracing ? 'is-tracing' : ''}`}
                >
                  <div className="admin-row-main">
                    <div className="admin-row-id">
                      <span
                        className={`admin-presence ${online ? 'is-online' : 'is-offline'} ${tracing ? 'is-tracing' : ''}`}
                        title={presenceLabel}
                        aria-label={presenceLabel}
                      />
                      <div className="admin-row-who">
                        <span className="admin-row-email">
                          {u.email ?? '—'}
                          {u.is_admin && <span className="admin-row-badge">admin</span>}
                          {Array.isArray(u.aliases) && u.aliases.length > 0 && (
                            <span
                              className="admin-row-badge"
                              title={`Merged with ${u.aliases.join(', ')}`}
                            >
                              +{u.aliases.length} alias
                            </span>
                          )}
                        </span>
                        {u.display_name && (
                          <span className="admin-row-name">{u.display_name}</span>
                        )}
                      </div>
                    </div>

                    <div className="admin-row-plan">
                      <span className={`admin-pill ${u.is_paid ? 'admin-pill-paid' : 'admin-pill-free'}`}>
                        {planLabel}
                      </span>
                      {u.status && (
                        <span className={`admin-pill admin-pill-${tone}`}>
                          {u.cancel_at_period_end ? 'Pending cancel' : u.status}
                        </span>
                      )}
                      {(() => {
                        const stage = userStage(u);
                        if (stage === 'paid') return null;  // 'Paid' pill above already says it
                        const def = STAGE_DEFS[stage];
                        return (
                          <span
                            className={`admin-pill admin-pill-stage admin-pill-${def.tone}`}
                            title={def.blurb}
                          >
                            {def.label}
                          </span>
                        );
                      })()}
                    </div>

                    <dl className="admin-row-meta">
                      <div>
                        <dt>Paid</dt>
                        <dd>
                          {u.paid_at ? formatDate(u.paid_at) : '—'}
                          {u.amount_cents != null && (
                            <span className="admin-row-amount">
                              {formatMoney(u.amount_cents, u.currency)}
                            </span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Expires</dt>
                        <dd>
                          {u.plan === 'lifetime'
                            ? 'Never'
                            : u.current_period_end
                              ? formatDate(u.current_period_end)
                              : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt>{online ? 'Status' : 'Last seen'}</dt>
                        <dd>{presenceLabel}</dd>
                      </div>
                      <div>
                        <dt>Joined</dt>
                        <dd>{formatDate(u.created_at)}</dd>
                      </div>
                    </dl>

                    <div className="admin-row-actions">
                      <button
                        type="button"
                        className="admin-row-toggle"
                        onClick={() => toggleExpand(u.id)}
                        aria-expanded={isOpen}
                        aria-controls={`admin-activity-${u.id}`}
                      >
                        {isOpen ? 'Hide activity' : 'View activity'}
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div id={`admin-activity-${u.id}`} className="admin-row-activity">
                      <TraceStatsTiles user={u} />
                      <ActivityPanel user={u} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
          </>
        )}
      </main>

    </div>
  );
}
