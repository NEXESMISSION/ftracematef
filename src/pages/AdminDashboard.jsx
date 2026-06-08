import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
// Operator-only styles, imported here (not in main.jsx) so this ~80KB of CSS
// loads with the lazy admin chunk and never ships to normal visitors.
import '../styles/admin.css';
import '../styles/admin-redesign.css';
import { useAuth } from '../auth/AuthProvider.jsx';
import { listAllUsers, getUserActivity, getAdminStats } from '../lib/admin.js';
import { AnnouncementsPanel, ReferralsPanel } from './admin/operationsPanels.jsx';
import { GalleryPanel, ReviewsPanel, TracedPanel, LibraryPanel } from './admin/contentPanels.jsx';
import { SurveyPanel } from './admin/insightsPanels.jsx';
import { friendlyError } from '../lib/errors.js';
import { usePresence } from '../hooks/usePresence.js';
import { PLAN_LABEL, PLAN_BY_ID } from '../lib/plans.js';
import { formatDuration, formatRelative as formatTraceRelative } from '../lib/traceStats.js';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';
// Pulse 2 (the heavy deep-dive) is lazy-loaded so its bytes — and cobe's — only
// download when the operator opens that tab, keeping the default admin chunk lean.
const AnalyticsPulseDetail = lazy(() => import('../components/AnalyticsPulseDetail.jsx'));

import {
  isTracingNow, normalizeUsers, STATUS_TONE, formatDate, formatDateTime, formatRelative,
  formatMoney, isOnline, STAGE_DEFS, userStage, PAGE_LABEL, lastSeenLabel, liveDurationSeconds,
} from './admin/adminLib.js';
import AdminHome from './admin/AdminHome.jsx';

/* ─────────────────────────────────────────────────────────────────────── */
/* Per-user activity log (drill-down) */

// Live, second-by-second duration counter for an open trace run.
// `lastHeartbeatAt` lets us freeze the ticker if the user backgrounded the
// tab — heartbeats stop on visibilitychange (see Trace.jsx), so a heartbeat
// older than the visible-tab cadence is the signal that the tab isn't live.
// Without this guard a paused/backgrounded session would tick up forever
// and mislead ops.

function LiveDuration({ startedAt, lastHeartbeatAt }) {
  const [seconds, setSeconds] = useState(() =>
    liveDurationSeconds(startedAt, lastHeartbeatAt)
  );
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return; // no point ticking a clock no one is looking at
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
    // Poll every 60s, but skip while the tab is hidden — getAdminStats runs a
    // stack of full-table aggregates, so polling a backgrounded dashboard was
    // pure wasted DB load. Refresh on return so the numbers are fresh.
    const id = setInterval(() => { if (!document.hidden) load(); }, 60_000);
    const onVisible = () => { if (!document.hidden && !cancelled) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  return { stats, health, error, loading };
}


/* ─────────────────────────────────────────────────────────────────────── */
/* Acquisition — group signups by signup_source (set by /r/:source clicks).
   Computed entirely client-side from the user list we already fetched, so
   there's no extra round-trip when this panel mounts. Rows sort by signup
   count descending so the channel sending the most volume is on top.    */

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
      key: 'recorded',
      label: 'Recordings saved',
      value: user.traces_recorded || 0,
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
      // Show the latest plan they opened on Dodo when we have it — for
      // "Bailed checkout" rows this is the most actionable signal on the
      // timeline (e.g. follow-up email pitches the same plan they tried).
      const planName = user.last_checkout_plan
        ? (PLAN_BY_ID[user.last_checkout_plan]?.name ?? user.last_checkout_plan)
        : null;
      out.push({
        kind: 'journey-warm',
        at: user.first_checkout_at,
        title: planName ? `Opened Dodo checkout — ${planName}` : 'Opened Dodo checkout',
        detail: user.last_checkout_at && user.last_checkout_at !== user.first_checkout_at
          ? `Latest attempt ${formatDate(user.last_checkout_at)}`
          : null,
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
/* Activity drawer — a slide-in overlay panel that shows one user's stats +
   timeline. Replaces the old inline accordion that pushed the whole list
   around when you expanded a row (jarring, and it re-flowed every other row).
   The drawer floats above everything, fetches on open, and closes on Esc /
   backdrop / ✕ — works from the Users OR the Survey tab. */

function ActivityDrawer({ user, onClose }) {
  // Esc-to-close + lock body scroll while the drawer is open.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="admin-drawer-root" role="dialog" aria-modal="true" aria-label="User activity">
      <div className="admin-drawer-backdrop" onClick={onClose} />
      <aside className="admin-drawer" role="document">
        <header className="admin-drawer-head">
          <div className="admin-drawer-id">
            <span className="admin-drawer-email">{user.email ?? '—'}</span>
            {user.display_name && <span className="admin-drawer-name">{user.display_name}</span>}
          </div>
          <button
            type="button"
            className="admin-drawer-close"
            onClick={onClose}
            aria-label="Close activity"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 4 L12 12 M12 4 L4 12" />
            </svg>
          </button>
        </header>
        <div className="admin-drawer-body">
          <TraceStatsTiles user={user} />
          <ActivityPanel user={user} />
        </div>
      </aside>
    </div>
  );
}

// Compact money for the revenue KPI tiles (e.g. $1.2k). USD shows a $ sign.
function compactMoney(cents, currency = 'USD') {
  const n = (Number(cents) || 0) / 100;
  const sym = currency === 'USD' ? '$' : '';
  if (n >= 1000) return `${sym}${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `${sym}${n % 1 === 0 ? n : n.toFixed(2)}`;
}

/* Money › Revenue — the numbers behind the headline, plus the at-risk list. */
function MoneyRevenuePanel({ stats }) {
  if (!stats) return <div className="adm-skel">Loading revenue…</div>;
  const rev = stats.revenue || {};
  const plans = rev.plans || {};
  const planEntries = Object.entries(plans);
  const atRisk = stats.at_risk || [];
  return (
    <>
      <div className="adm-kpis">
        <div className="adm-kpi adm-kpi-coral"><span className="adm-kpi-label">MRR</span><span className="adm-kpi-value">{compactMoney(rev.mrr_cents)}</span><span className="adm-kpi-sub">monthly recurring</span></div>
        <div className="adm-kpi adm-kpi-green"><span className="adm-kpi-label">Lifetime revenue</span><span className="adm-kpi-value">{compactMoney(rev.lifetime_revenue_cents)}</span><span className="adm-kpi-sub">all-time collected</span></div>
        <div className="adm-kpi adm-kpi-blue"><span className="adm-kpi-label">New today</span><span className="adm-kpi-value">{rev.paid_today || 0}</span><span className="adm-kpi-sub">{rev.paid_this_week || 0} this week</span></div>
        <div className="adm-kpi adm-kpi-violet"><span className="adm-kpi-label">New this month</span><span className="adm-kpi-value">{rev.paid_this_month || 0}</span><span className="adm-kpi-sub">paid conversions</span></div>
      </div>

      <div className="adm-grid" style={{ marginTop: 16 }}>
        <div className="adm-card">
          <div className="adm-card-h"><span className="adm-card-title">Active plans</span></div>
          {planEntries.length === 0 ? <p className="adm-empty">No active paid plans.</p> : (
            <div className="adm-chips">
              {planEntries.map(([plan, n]) => (
                <span className="adm-chip" key={plan}>{PLAN_LABEL[plan] ?? plan} <b>{n}</b></span>
              ))}
            </div>
          )}
        </div>

        <div className="adm-card adm-card-wide">
          <div className="adm-card-h"><span className="adm-card-title">At-risk paying users</span><span className="adm-card-meta">inactive 14+ days</span></div>
          {atRisk.length === 0 ? <p className="adm-empty">No at-risk users — everyone’s active. 🎉</p> : (
            <div className="adm-feed">
              {atRisk.map((u) => (
                <div className="adm-feed-row" key={u.id} style={{ cursor: 'default' }}>
                  <span className="adm-feed-dot" style={{ background: 'var(--adm-amber)' }} />
                  <div className="adm-feed-who">
                    <div className="adm-feed-email">{u.email || '—'}</div>
                    <div className="adm-feed-meta">
                      {PLAN_LABEL[u.plan] ?? u.plan ?? 'paid'}
                      {u.days_since_seen != null ? ` · last seen ${u.days_since_seen}d ago` : ' · never seen'}
                      {u.current_period_end ? ` · renews ${formatDate(u.current_period_end)}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
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
  const [expanded, setExpanded] = useState(null);    // user_id whose activity drawer is open
  // Incremental rendering. We only mount PAGE_SIZE rows at a time and grow on
  // demand, so a large account list never dumps hundreds of DOM nodes (with
  // presence dots, pills, and meta grids each) into the page at once. Counts +
  // funnel tiles still reflect the full set — they're cheap numeric loops over
  // the array, not DOM.
  const PAGE_SIZE = 25;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Primary navigation — 3 areas. Dashboard = the command center (AdminHome);
  // People = users directory + visitor analytics + survey; Manage = revenue,
  // referrals, content moderation, announcements. Each non-home area has a
  // light secondary sub-tab bar.
  const [section, setSection]     = useState('home');      // home | people | manage
  const [peopleTab, setPeopleTab] = useState('users');     // users | visitors | survey
  const [manageTab, setManageTab] = useState('revenue');   // revenue | referrals | content | announce
  const [contentTab, setContentTab] = useState('gallery'); // gallery | traced | reviews | library (under Content)

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

  // Auto-refresh every 30s while the page is open AND visible. Skipping the
  // poll on a backgrounded tab avoids needless admin-list-users hits against
  // the DB (an operator who leaves the dashboard open in a background tab used
  // to poll forever); we refresh immediately when they return so they never
  // stare at stale data.
  useEffect(() => {
    let cancelled = false;
    (async () => { try { await loadUsers(); } catch { /* logged via setError */ } })();
    const id = setInterval(() => {
      if (cancelled || document.hidden) return;
      loadUsers().catch(() => { /* surfaced via setError */ });
      setTick((t) => t + 1);
    }, 30_000);
    const onVisible = () => { if (!document.hidden && !cancelled) loadUsers().catch(() => {}); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [loadUsers]);

  // Lightweight local tick — only re-evaluates the heartbeat-fresh
  // computations against the current data, no network round-trip. Lets
  // a row's "tracing" state flip off as soon as the heartbeat goes
  // stale, instead of waiting up to 30s for the next list refresh. Paused on a
  // hidden tab (nothing to re-render when it's not on screen).
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) setTick((t) => t + 1); }, 5_000);
    return () => clearInterval(id);
  }, []);

  // Pull-to-refresh — touch devices only. On desktop a mouse-drag from the
  // top was hijacking normal click-drags (text selection, etc.) and firing
  // an unwanted refresh, so we gate it to genuine touch screens.
  const isTouch = typeof window !== 'undefined'
    && (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0);
  const { pullDistance, triggered, isRefreshing, threshold } = usePullToRefresh({
    onRefresh: loadUsers,
    threshold: 70,
    enabled: isTouch,
  });

  const counts = useMemo(() => {
    if (!users) return { all: 0, paid: 0, unpaid: 0, online: 0, tracing: 0, warm: 0 };
    // Admins (operator self-views, team test accounts) skew every funnel
    // they appear in. Drop them from every tile so headline numbers reflect
    // real users only. Admins still render in the list with their badge.
    const real = users.filter((u) => !u.is_admin);
    let paid = 0, online = 0, tracing = 0, warm = 0;
    for (const u of real) {
      if (u.is_paid) paid++;
      if (isOnline(u.last_seen_at)) {
        online++;
        if (isTracingNow(u)) tracing++;
      }
      // 'warm' = opened checkout, didn't finish — the one recoverable segment
      // worth a dedicated filter (the rest is visible via the per-row stage pill).
      if (userStage(u) === 'warm') warm++;
    }
    void tick;
    return { all: real.length, paid, unpaid: real.length - paid, online, tracing, warm };
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
      if (filter === 'warm' && userStage(u) !== 'warm') return false;
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

  // Any change to what's being shown collapses back to the first page so the
  // operator isn't scrolled into the middle of a freshly-filtered list.
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filter, sort, query]);

  // The user whose activity drawer is open (looked up fresh each render by id
  // so a 30s list refresh keeps the drawer showing up-to-date data). Works
  // from any tab — the drawer is an overlay, not an inline expansion.
  const expandedUser = useMemo(
    () => (expanded && users ? users.find((u) => u.id === expanded) ?? null : null),
    [expanded, users],
  );

  return (
    <div
      className="admin-shell adm"
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
      <header className="adm-top">
        <div className="adm-brand">
          <span className="adm-brand-tag">ADMIN</span>
          <span className="adm-brand-title">Trace Mate</span>
        </div>
        <div className="adm-top-spacer" />
        <span className="adm-live-chip"><span className="adm-dot" />{counts.online} live</span>
        <span className="adm-top-me">{user?.email}</span>
        <Link to="/account" className="adm-tlink">Account</Link>
        <button type="button" className="adm-tlink adm-tlink-danger" onClick={signOut}>Sign out</button>
      </header>

      <nav className="adm-nav" role="tablist" aria-label="Dashboard sections">
        {[
          { id: 'home',   label: 'Dashboard', ico: '📊' },
          { id: 'people', label: 'People',    ico: '👥' },
          { id: 'manage', label: 'Manage',    ico: '🛠️' },
        ].map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            className={`adm-nav-tab ${section === s.id ? 'is-active' : ''}`}
            onClick={() => setSection(s.id)}
          >
            <span className="adm-nav-ico" aria-hidden="true">{s.ico}</span>{s.label}
          </button>
        ))}
      </nav>

      <main className="adm-wrap">
        {/* Dashboard (home) */}
        {section === 'home' && (
          <AdminHome
            users={users}
            stats={meta.stats}
            onPickUser={(uid) => setExpanded(uid)}
            onGoTo={(s) => setSection(s)}
          />
        )}

        {/* People (users / visitors / survey) */}
        {section === 'people' && (
          <>
            <div className="adm-sub">
              {[
                { id: 'users',    label: 'Users', count: counts.all },
                { id: 'visitors', label: 'Visitors' },
                { id: 'survey',   label: 'Survey' },
              ].map((t) => (
                <button key={t.id} type="button"
                  className={`adm-sub-tab ${peopleTab === t.id ? 'is-active' : ''}`}
                  onClick={() => setPeopleTab(t.id)}>
                  {t.label}{t.count != null && <span className="adm-sub-count">{t.count}</span>}
                </button>
              ))}
            </div>

            {peopleTab === 'visitors' && (
              <div className="adm-panel-host">
                <Suspense fallback={<p className="pulse-empty">Loading visitor analytics…</p>}>
                  <AnalyticsPulseDetail />
                </Suspense>
              </div>
            )}

            {peopleTab === 'survey' && (
              <div className="adm-panel-host">
                <SurveyPanel users={users} onPickUser={(uid) => setExpanded(uid)} />
              </div>
            )}

            {peopleTab === 'users' && (
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
              // The one funnel-stage filter worth keeping: people who opened
              // checkout but didn't finish — recoverable revenue worth chasing.
              { id: 'warm',    label: 'Bailed',  count: counts.warm,   hint: 'Opened checkout but didn\'t finish — recoverable' },
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
            {filtered.slice(0, visibleCount).map((u) => {
              const online    = isOnline(u.last_seen_at);
              const tracing   = isTracingNow(u);
              const tone      = STATUS_TONE[u.status] ?? 'neutral';
              const planLabel = u.plan ? (PLAN_LABEL[u.plan] ?? u.plan) : 'No plan';
              const isOpen    = expanded === u.id;
              const presenceLabel = lastSeenLabel(u, online);
              return (
                <li
                  key={u.id}
                  data-user-id={u.id}
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
                        // For 'warm' (Bailed checkout) rows, append the plan
                        // they tried — pre-migration rows have no plan and
                        // fall back to the generic label.
                        let label = def.label;
                        let title = def.blurb;
                        if (stage === 'warm' && u.last_checkout_plan) {
                          const planName = PLAN_BY_ID[u.last_checkout_plan]?.name ?? u.last_checkout_plan;
                          label = `Bailed ${planName}`;
                          title = `${def.blurb} — opened ${PLAN_LABEL[u.last_checkout_plan] ?? planName} on Dodo`;
                        }
                        return (
                          <span
                            className={`admin-pill admin-pill-stage admin-pill-${def.tone}`}
                            title={title}
                          >
                            {label}
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
                        <dt>{online ? 'Status' : 'Last seen'}</dt>
                        <dd>{presenceLabel}</dd>
                      </div>
                    </dl>

                    <div className="admin-row-actions">
                      <button
                        type="button"
                        className="admin-row-toggle"
                        onClick={() => setExpanded(u.id)}
                        aria-haspopup="dialog"
                      >
                        Activity
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Incremental load — only PAGE_SIZE rows are mounted at a time. */}
        {users && filtered.length > visibleCount && (
          <div className="admin-loadmore">
            <button
              type="button"
              className="admin-loadmore-btn"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            >
              Load {Math.min(PAGE_SIZE, filtered.length - visibleCount)} more
            </button>
            <span className="admin-loadmore-meta">
              Showing {Math.min(visibleCount, filtered.length)} of {filtered.length}
            </span>
          </div>
        )}
          </>
        )}
          </>
        )}

        {/* Manage (revenue / referrals / content / announcements) */}
        {section === 'manage' && (
          <>
            <div className="adm-sub">
              {[
                { id: 'revenue',   label: 'Revenue' },
                { id: 'referrals', label: 'Referrals' },
                { id: 'content',   label: 'Content' },
                { id: 'announce',  label: 'Announcements' },
              ].map((t) => (
                <button key={t.id} type="button"
                  className={`adm-sub-tab ${manageTab === t.id ? 'is-active' : ''}`}
                  onClick={() => setManageTab(t.id)}>{t.label}</button>
              ))}
            </div>
            <div className="adm-panel-host">
              {manageTab === 'revenue' && (
                <>
                  {meta.health && <WebhookHealthPanel data={meta.health} />}
                  <MoneyRevenuePanel stats={meta.stats} />
                </>
              )}
              {manageTab === 'referrals' && <ReferralsPanel />}
              {manageTab === 'announce'  && <AnnouncementsPanel />}
              {manageTab === 'content' && (
                <>
                  <div className="adm-sub adm-sub-inner">
                    {[
                      { id: 'gallery', label: 'Gallery' },
                      { id: 'traced',  label: 'Traced' },
                      { id: 'reviews', label: 'Reviews' },
                      { id: 'library', label: 'Library' },
                    ].map((t) => (
                      <button key={t.id} type="button"
                        className={`adm-sub-tab ${contentTab === t.id ? 'is-active' : ''}`}
                        onClick={() => setContentTab(t.id)}>{t.label}</button>
                    ))}
                  </div>
                  {contentTab === 'gallery' && <GalleryPanel />}
                  {contentTab === 'traced'  && <TracedPanel />}
                  {contentTab === 'reviews' && <ReviewsPanel />}
                  {contentTab === 'library' && <LibraryPanel />}
                </>
              )}
            </div>
          </>
        )}
      </main>

      {expandedUser && (
        <ActivityDrawer user={expandedUser} onClose={() => setExpanded(null)} />
      )}
    </div>
  );
}
