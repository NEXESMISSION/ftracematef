import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { listAllUsers, getUserActivity, getAdminStats } from '../lib/admin.js';
import { friendlyError } from '../lib/errors.js';
import { usePresence } from '../hooks/usePresence.js';
import { PLAN_LABEL } from '../lib/plans.js';
import { ANALYTICS_PROVIDER, ANALYTICS_EMBED_URL } from '../lib/analytics.js';
import { formatDuration, formatRelative as formatTraceRelative } from '../lib/traceStats.js';
import { startViewer } from '../lib/livePreview.js';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';

// Anyone seen pinging the heartbeat within this window is treated as "in the
// app right now". Tab visibility throttles the heartbeat to 60s, so 2 minutes
// gives one missed-tick of slack before the dot drops.
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

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
    if (u.current_page === 'trace' && u.current_image_label) {
      return `Tracing "${u.current_image_label}"`;
    }
    if (u.current_page && PAGE_LABEL[u.current_page]) {
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

function Timeline({ activity }) {
  // Merge events from three sources into a single chronological feed —
  // operator scans top-to-bottom, no need to remember which silo holds what.
  const items = useMemo(() => {
    if (!activity) return [];
    const merged = [];
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
    return merged
      .filter((m) => m.at)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [activity]);

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
            {item.detail && <div className="admin-timeline-detail">{item.detail}</div>}
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

function StatsPanel() {
  const [stats, setStats]   = useState(null);
  const [error, setError]   = useState(null);
  const [loading, setLoading] = useState(true);

  // Refresh every 60s while the page is open. The rollup is heavier than the
  // user-list read so we don't run it on the same 30s cadence.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getAdminStats();
        if (!cancelled) {
          setStats(data);
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
/* Spectate modal — operator peeks at a tracing user's live camera feed
   over WebRTC. Reuses lib/livePreview.js with kind:'tracewatch' so it never
   collides with the user's own /live phone↔desktop pairing. */

const SPECTATE_STATUS_LABEL = {
  waiting:      'Waiting for the user…',
  connecting:   'Connecting…',
  connected:    'Live',
  reconnecting: 'Reconnecting…',
  disconnected: 'Disconnected',
};

function SpectateModal({ user, onClose }) {
  const videoRef = useRef(null);
  const viewerRef = useRef(null);
  const [status, setStatus] = useState('waiting');
  const [error, setError]   = useState(null);
  // Reference image arrives via WebRTC data channel a beat after the video
  // tracks. Render side-by-side so the operator sees both the user's
  // camera feed and the picture they're tracing without leaving the modal.
  const [referenceImage, setReferenceImage] = useState(null);
  // Audio flows over the same peer connection. Default unmuted because the
  // operator clicked Watch Live (counts as user gesture for autoplay
  // policy). Toggle exposed for hands-free monitoring sessions.
  const [muted, setMuted] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  // Bumped on Retry — drives the connection useEffect to re-mount the
  // viewer without closing/reopening the modal.
  const [retryNonce, setRetryNonce] = useState(0);
  // Flips on once we've been in 'waiting' / 'connecting' for >8s, so we
  // can show the operator a hint instead of an indefinite spinner.
  const [stuckHint, setStuckHint] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    setStatus('waiting');
    setError(null);
    setReferenceImage(null);
    setHasAudio(false);
    setStuckHint(false);

    // Use the per-session spectate_token as the channel-key. Without a
    // valid token the channel is unguessable (UUID v4, 122 bits) — even
    // a user who knows another user's UUID can't subscribe. Falls back
    // to user.id only if the dashboard's data is from before the token
    // migration; in that case the connection won't establish (the
    // broadcaster is on the new token-keyed channel) and the operator
    // sees Waiting → Retry pulls the latest token from the server.
    const channelKey = user.spectate_token || user.id;
    const v = startViewer({
      userId: channelKey,
      kind: 'tw',
      onStream: (stream) => {
        const el = videoRef.current;
        if (!el) return;
        el.srcObject = stream;
        // Track-presence drives the mute UI affordance — if the user
        // denied mic on /trace there's no audio track and the toggle
        // shouldn't pretend otherwise.
        setHasAudio(stream.getAudioTracks().length > 0);
        // Browsers require a play() after srcObject in some flows; ignore
        // promise rejection (autoplay policy may still need a gesture).
        el.play().catch(() => { /* autoplay policy / handled by element */ });
      },
      onStatus: (s) => setStatus(s),
      onError:  (msg) => setError(msg || 'Connection error'),
      onReferenceImage: (dataUrl) => setReferenceImage(dataUrl),
    });
    viewerRef.current = v;

    return () => {
      try { v.stop(); } catch { /* ignore */ }
      viewerRef.current = null;
      const el = videoRef.current;
      if (el) {
        try { el.srcObject = null; } catch { /* ignore */ }
      }
    };
    // Re-subscribe on:
    //  - new user (Watch live on a different row)
    //  - new token (user opened a fresh tracing session)
    //  - manual Retry (retryNonce bump)
  }, [user?.id, user?.spectate_token, retryNonce]);

  // Stuck-hint timer: if we're not connected after 8 seconds, show the
  // operator a why-might-this-be-stuck note + Retry button. The most
  // common cause is the user's tab still running an old cached bundle
  // that broadcasts on a different channel — a refresh on their side
  // pairs them up. Resets when status flips to 'connected'.
  useEffect(() => {
    if (status === 'connected') {
      setStuckHint(false);
      return;
    }
    setStuckHint(false);
    const t = setTimeout(() => setStuckHint(true), 8000);
    return () => clearTimeout(t);
  }, [status, retryNonce]);

  // Keep the <video>'s muted attribute in sync with our toggle. Setting it
  // imperatively avoids a React re-render churn each toggle.
  useEffect(() => {
    const el = videoRef.current;
    if (el) el.muted = muted;
  }, [muted]);

  // Close on Escape — common modal expectation, no need for a global hook.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="admin-spectate-backdrop" onClick={onClose} role="presentation">
      <div
        className="admin-spectate-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Live view of ${user?.email ?? 'user'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="admin-spectate-head">
          <div className="admin-spectate-id">
            <span className="admin-spectate-email">{user?.email ?? '—'}</span>
            {user?.current_image_label && (
              <span className="admin-spectate-img">
                tracing "{user.current_image_label}"
              </span>
            )}
          </div>
          <div className="admin-spectate-actions">
            {hasAudio && (
              <button
                type="button"
                className={`admin-spectate-mute ${muted ? 'is-muted' : ''}`}
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <path d="M15.54 8.46a5 5 0 010 7.07" />
                    <path d="M19.07 4.93a10 10 0 010 14.14" />
                  </svg>
                )}
              </button>
            )}
            <button
              type="button"
              className="admin-spectate-close"
              onClick={onClose}
              aria-label="Close live view"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="admin-spectate-stage">
          <div className="admin-spectate-video-wrap">
            <video
              ref={videoRef}
              className="admin-spectate-video"
              playsInline
              autoPlay
            />
            <div
              className={`admin-spectate-status admin-spectate-status-${status}`}
              aria-live="polite"
            >
              {error ? error : SPECTATE_STATUS_LABEL[status] ?? status}
            </div>
            {/* If we've been waiting for >8s without a frame, surface a
                hint so the operator isn't staring at a blank box wondering
                if the tool is broken. Most common cause is the user's
                tab on a stale cached bundle — Retry re-mounts the viewer
                in case the dashboard meanwhile picked up a fresh token. */}
            {stuckHint && status !== 'connected' && (
              <div className="admin-spectate-hint" role="status">
                <p>
                  Not connecting. The user may need to refresh their tab,
                  or they're behind a strict NAT.
                </p>
                <button
                  type="button"
                  className="admin-spectate-retry"
                  onClick={() => setRetryNonce((n) => n + 1)}
                >
                  Retry
                </button>
              </div>
            )}
          </div>
          <aside className="admin-spectate-ref" aria-label="Reference image">
            {referenceImage ? (
              <img
                src={referenceImage}
                alt={user?.current_image_label || 'Reference image'}
                className="admin-spectate-ref-img"
                draggable={false}
              />
            ) : (
              <div className="admin-spectate-ref-empty">
                <span>Reference image</span>
                <small>{stuckHint ? 'Waiting on user…' : 'Loading…'}</small>
              </div>
            )}
          </aside>
        </div>

        <footer className="admin-spectate-foot">
          <span>P2P · {hasAudio ? 'video + audio' : 'video only'} · no recording</span>
        </footer>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function ActivityPanel({ userId }) {
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

  return (
    <div className="admin-activity">
      {!activity && !error && (
        <div className="admin-activity-loading">
          <span className="admin-spinner" aria-hidden="true" />
          <span>Loading activity…</span>
        </div>
      )}
      {error && <p className="admin-error">{error}</p>}
      {activity && <Timeline activity={activity} />}
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
  const [spectate, setSpectate] = useState(null);    // user object whose camera we're peeking at, or null

  // Load function exposed at component scope so both the auto-refresh
  // timer AND the pull-to-refresh handler can call it. Throws on
  // failure so pull-to-refresh's spinner snaps off cleanly.
  const loadUsers = useCallback(async () => {
    try {
      const items = await listAllUsers();
      setUsers(items);
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

  // Pull-to-refresh on mobile (PWA): drag down from the top of the page
  // to force a fresh fetch without hunting for the URL bar. Desktop
  // mouse-drag works too — handy for testing.
  const { pullDistance, triggered, isRefreshing, threshold } = usePullToRefresh({
    onRefresh: loadUsers,
    threshold: 70,
  });

  const counts = useMemo(() => {
    if (!users) return { all: 0, paid: 0, unpaid: 0, online: 0, tracing: 0 };
    let paid = 0, online = 0, tracing = 0;
    for (const u of users) {
      if (u.is_paid) paid++;
      if (isOnline(u.last_seen_at)) {
        online++;
        if (u.current_page === 'trace') tracing++;
      }
    }
    void tick;
    return { all: users.length, paid, unpaid: users.length - paid, online, tracing };
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
      if (filter === 'online'  && !isOnline(u.last_seen_at)) return false;
      if (filter === 'tracing' && (
        !isOnline(u.last_seen_at) || u.current_page !== 'trace'
      )) return false;
      if (q && !(u.email ?? '').toLowerCase().includes(q)
            && !(u.display_name ?? '').toLowerCase().includes(q)) {
        return false;
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

        <StatsPanel />

        <TrafficPanel />

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
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={filter === t.id}
                className={`admin-tab ${filter === t.id ? 'is-active' : ''}`}
                onClick={() => setFilter(t.id)}
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
              const tracing   = online && u.current_page === 'trace';
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
                      {tracing && u.spectate_token && (
                        <button
                          type="button"
                          className="admin-row-watch"
                          onClick={() => setSpectate(u)}
                          aria-label={`Watch ${u.email ?? 'user'} live`}
                          title="Live camera view"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
                               stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                               strokeLinejoin="round" aria-hidden="true">
                            <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
                            <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
                          </svg>
                          Watch live
                        </button>
                      )}
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
                      <ActivityPanel userId={u.id} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {spectate && (
        <SpectateModal user={spectate} onClose={() => setSpectate(null)} />
      )}
    </div>
  );
}
