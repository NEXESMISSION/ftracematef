import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
// Operator-only styles, imported here (not in main.jsx) so this ~80KB of CSS
// loads with the lazy admin chunk and never ships to normal visitors.
import '../styles/admin.css';
import '../styles/admin-redesign.css';
import { useAuth } from '../auth/AuthProvider.jsx';
import {
  listAllUsers, getUserActivity, getAdminStats, getAnalytics,
  listReferrers, createReferrer, updateReferrer, markCommissionsPaid,
  listAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement,
} from '../lib/admin.js';
import { GalleryPanel, ReviewsPanel, TracedPanel, LibraryPanel } from './admin/contentPanels.jsx';
import { friendlyError } from '../lib/errors.js';
import { usePresence } from '../hooks/usePresence.js';
import { PLAN_LABEL, PLAN_BY_ID } from '../lib/plans.js';
import { formatDuration, formatRelative as formatTraceRelative } from '../lib/traceStats.js';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';
import AnalyticsPulse from '../components/AnalyticsPulse.jsx';
// Pulse 2 (the heavy deep-dive) is lazy-loaded so its bytes — and cobe's — only
// download when the operator opens that tab, keeping the default admin chunk lean.
const AnalyticsPulseDetail = lazy(() => import('../components/AnalyticsPulseDetail.jsx'));

import {
  isTracingNow, normalizeUsers, STATUS_TONE, formatDate, formatDateTime, formatRelative,
  formatMoney, isOnline, STAGE_DEFS, userStage, PAGE_LABEL, lastSeenLabel, liveDurationSeconds,
} from './admin/adminLib.js';

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

function AcquisitionPanel({ users }) {
  // Which source rows are expanded to show their per-campaign breakdown.
  const [open, setOpen] = useState(() => new Set());

  const { rows, totals } = useMemo(() => {
    if (!Array.isArray(users)) return { rows: [], totals: { signups: 0, paid: 0 } };
    const bySource = new Map();
    let unattributed = 0;
    let unattributedPaid = 0;
    for (const u of users) {
      // Admins skew the funnel — drop them, same as the count tiles.
      if (u?.is_admin) continue;
      const src = (u?.signup_source || '').trim();
      if (!src) {
        unattributed += 1;
        if (u?.is_paid) unattributedPaid += 1;
        continue;
      }
      const cur = bySource.get(src) ?? { source: src, signups: 0, paid: 0, campaigns: new Map() };
      cur.signups += 1;
      if (u.is_paid) cur.paid += 1;
      // Nest the ?c=<label> sub-breakdown so a single channel split across
      // many posts/ads is legible without burning a top-level slug each time.
      const camp = (u?.signup_campaign || '').trim() || '(none)';
      const cc = cur.campaigns.get(camp) ?? { campaign: camp, signups: 0, paid: 0 };
      cc.signups += 1;
      if (u.is_paid) cc.paid += 1;
      cur.campaigns.set(camp, cc);
      bySource.set(src, cur);
    }
    const list = Array.from(bySource.values())
      .map((r) => ({
        ...r,
        campaigns: Array.from(r.campaigns.values()).sort((a, b) => b.signups - a.signups),
      }))
      .sort((a, b) => b.signups - a.signups);
    // Always pin "(direct / unknown)" at the bottom — the catch-all for users
    // who came in before tagged links existed, typed the URL directly, or
    // arrived via a channel we haven't tagged. A sanity check on how much
    // traffic is still unattributed, never the lead row.
    if (unattributed > 0) {
      list.push({
        source: '(direct / unknown)',
        signups: unattributed,
        paid: unattributedPaid,
        campaigns: [],
        muted: true,
      });
    }
    const tot = list.reduce(
      (acc, r) => ({ signups: acc.signups + r.signups, paid: acc.paid + r.paid }),
      { signups: 0, paid: 0 },
    );
    return { rows: list, totals: tot };
  }, [users]);

  const toggle = useCallback((src) => {
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(src)) next.delete(src); else next.add(src);
      return next;
    });
  }, []);

  return (
    <section className="admin-stats" aria-labelledby="admin-acq-title">
      <header className="admin-stats-head">
        <h2 id="admin-acq-title">Acquisition by source</h2>
        <span className="admin-stats-when">
          share <code>tracemate.art/r/&lt;source&gt;</code> or an alias
          (<code>/tiktok</code>, <code>/reddit</code>, <code>/yt</code>,
          <code>/ig</code>, <code>/x</code>, <code>/threads</code>, <code>/tt</code>)
          and the slug shows up here. Add <code>?c=&lt;label&gt;</code> for
          per-post breakdowns — click a source to expand them. Now stamped to a
          cookie + localStorage, so social in-app browsers attribute reliably.
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
            // A source has a meaningful campaign breakdown when it has more
            // than one bucket, or a single bucket that isn't the "(none)"
            // catch-all. Otherwise the row isn't expandable.
            const realCampaigns = (r.campaigns ?? []).filter((c) => c.campaign !== '(none)');
            const expandable = realCampaigns.length > 0;
            const isOpen = open.has(r.source);
            return (
              <div key={r.source} className="admin-acq-group" role="presentation">
                <div
                  className={`admin-acq-row ${r.muted ? 'admin-acq-row-muted' : ''} ${expandable ? 'admin-acq-row-expandable' : ''}`}
                  role="row"
                  onClick={expandable ? () => toggle(r.source) : undefined}
                  style={expandable ? { cursor: 'pointer' } : undefined}
                >
                  <span className="admin-acq-source" role="cell">
                    {expandable && (
                      <span aria-hidden="true" style={{ display: 'inline-block', width: 14 }}>
                        {isOpen ? '▾' : '▸'}
                      </span>
                    )}
                    {r.source}
                  </span>
                  <span role="cell">{r.signups}</span>
                  <span role="cell">{r.paid}</span>
                  <span role="cell">{conv}%</span>
                </div>
                {isOpen && expandable && realCampaigns.map((c) => {
                  const cconv = c.signups > 0 ? Math.round((c.paid / c.signups) * 100) : 0;
                  return (
                    <div key={c.campaign} className="admin-acq-row admin-acq-row-sub" role="row">
                      <span className="admin-acq-source" role="cell" style={{ paddingLeft: 28 }}>
                        ?c={c.campaign}
                      </span>
                      <span role="cell">{c.signups}</span>
                      <span role="cell">{c.paid}</span>
                      <span role="cell">{cconv}%</span>
                    </div>
                  );
                })}
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
/* Referrals — affiliate partners + commission payouts. Each partner has a
   unique /i/<code> link; signups and sales referred through it are tracked
   here, with a one-click "mark paid" once you've sent their commission. Data
   comes from the admin-referrals Edge Function (get_referral_stats rollup). */

// cents → "$x.xx" (commissions are stored in cents; we display USD-style).
function fmtCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '$0';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
      maximumFractionDigits: n % 100 === 0 ? 0 : 2,
    }).format(n / 100);
  } catch {
    return `$${(n / 100).toFixed(2)}`;
  }
}

// Human-readable commission terms for a referrer row.
function commissionLabel(r) {
  if (r.commission_flat_cents != null) return `${fmtCents(r.commission_flat_cents)} / sale`;
  return `${(Number(r.commission_rate_bps) || 0) / 100}%`;
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Announce — operator broadcast popups. Author a message, target a segment
   (all / free / paid / inactive 14d+), set a frequency (once / daily /
   always), and signed-in users see it as a dismissible modal on next load.
   Data comes from the admin-announcements Edge Function (get_admin_
   announcement_stats rollup, with per-message seen/tapped/dismissed counts). */

const ANN_SEGMENTS = [
  { value: 'all',      label: 'All users' },
  { value: 'free',     label: 'Free users' },
  { value: 'paid',     label: 'Paid users' },
  { value: 'inactive', label: 'Inactive 14d+' },
];
const ANN_FREQS = [
  { value: 'once',   label: 'Once' },
  { value: 'daily',  label: 'Daily' },
  { value: 'always', label: 'Always' },
];

const ANN_BLANK = {
  title: '', body: '', segment: 'all', cta_label: '', cta_url: '',
  frequency: 'once', expires_at: '',
};

function AnnouncementsPanel() {
  const [rows, setRows]   = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy]   = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [form, setForm]   = useState(ANN_BLANK);

  const upd = useCallback((k, v) => setForm((f) => ({ ...f, [k]: v })), []);

  const load = useCallback(async () => {
    try {
      const data = await listAnnouncements();
      setRows(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      setError(friendlyError(e, 'Could not load announcements.'));
      setRows([]); // never leave rows null on failure — the render does rows.map
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onCreate = useCallback(async (e) => {
    e.preventDefault();
    if (!form.body.trim()) { setError('Body is required.'); return; }
    setBusy(true);
    try {
      await createAnnouncement({
        title:      form.title || undefined,
        body:       form.body,
        segment:    form.segment,
        cta_label:  form.cta_label || undefined,
        cta_url:    form.cta_url || undefined,
        frequency:  form.frequency,
        expires_at: form.expires_at || undefined,
      });
      setForm(ANN_BLANK);
      await load();
    } catch (err) {
      setError(friendlyError(err, 'Could not publish announcement.'));
    } finally {
      setBusy(false);
    }
  }, [form, load]);

  const onToggleActive = useCallback(async (a) => {
    setSavingId(a.id);
    try {
      await updateAnnouncement(a.id, { active: !a.active });
      await load();
    } catch (err) {
      setError(friendlyError(err, 'Could not update announcement.'));
    } finally {
      setSavingId(null);
    }
  }, [load]);

  const onDelete = useCallback(async (a) => {
    if (!window.confirm('Delete this announcement? This cannot be undone.')) return;
    setSavingId(a.id);
    try {
      await deleteAnnouncement(a.id);
      await load();
    } catch (err) {
      setError(friendlyError(err, 'Could not delete announcement.'));
    } finally {
      setSavingId(null);
    }
  }, [load]);

  const segLabel  = (v) => (ANN_SEGMENTS.find((s) => s.value === v)?.label ?? v);
  const freqLabel = (v) => (ANN_FREQS.find((s) => s.value === v)?.label ?? v);
  const fmtExpiry = (ts) => (ts ? new Date(ts).toLocaleString() : 'never');

  return (
    <section className="admin-stats" aria-labelledby="admin-ann-title">
      <header className="admin-stats-head">
        <h2 id="admin-ann-title">Announcements</h2>
        <p className="admin-stats-sub">
          Push a popup to signed-in users. Target a segment, pick how often it
          shows, and watch seen / tapped / dismissed counts below.
        </p>
      </header>

      {error && <p className="admin-ref-error" role="alert">{error}</p>}

      <form className="admin-ref-create admin-ann-create" onSubmit={onCreate}>
        <div className="admin-ref-form-grid">
          <label>Title<input value={form.title} onChange={(e) => upd('title', e.target.value)} placeholder="(optional)" /></label>
          <label>Segment
            <select value={form.segment} onChange={(e) => upd('segment', e.target.value)}>
              {ANN_SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label>Frequency
            <select value={form.frequency} onChange={(e) => upd('frequency', e.target.value)}>
              {ANN_FREQS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label>Expires<input type="datetime-local" value={form.expires_at} onChange={(e) => upd('expires_at', e.target.value)} /></label>
          <label>CTA label<input value={form.cta_label} onChange={(e) => upd('cta_label', e.target.value)} placeholder="(optional)" /></label>
          <label>CTA URL<input value={form.cta_url} onChange={(e) => upd('cta_url', e.target.value)} placeholder="/pricing or https://…" /></label>
        </div>
        <label className="admin-ann-bodyfield">
          Body
          <textarea
            className="admin-ann-textarea"
            rows={3}
            value={form.body}
            onChange={(e) => upd('body', e.target.value)}
          />
        </label>
        <button type="submit" className="admin-ref-btn" disabled={busy}>
          {busy ? 'Publishing…' : '+ Publish announcement'}
        </button>
      </form>

      {rows === null && !error ? (
        <p className="admin-ref-muted">Loading…</p>
      ) : (rows && rows.length === 0) ? (
        <p className="admin-ref-muted">No announcements yet. Publish one above.</p>
      ) : (
        <div className="admin-ann-list">
          {rows.map((a) => (
            <div key={a.id} className={`admin-ann-card ${a.active ? '' : 'admin-ann-card-off'}`}>
              <div className="admin-ann-card-head">
                <span className="admin-ann-card-title">
                  {a.title || '(no title)'}
                  {!a.active && <span className="admin-ref-tag">off</span>}
                </span>
                <span className="admin-ref-actions">
                  <button
                    type="button" className="admin-ref-btn admin-ref-btn-sm"
                    disabled={savingId === a.id} onClick={() => onToggleActive(a)}
                  >
                    {a.active ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button" className="admin-ref-btn admin-ref-btn-sm admin-ref-btn-ghost"
                    disabled={savingId === a.id} onClick={() => onDelete(a)}
                  >
                    Delete
                  </button>
                </span>
              </div>
              <div className="admin-ann-msg">{a.body}</div>
              <div className="admin-ann-meta">
                <span>{segLabel(a.segment)}</span>
                <span>{freqLabel(a.frequency)}</span>
                <span>Expires: {fmtExpiry(a.expires_at)}</span>
                {a.cta_label ? <span>CTA: {a.cta_label}</span> : null}
              </div>
              <div className="admin-ann-counts">
                <span>{a.seen_count ?? 0} seen</span>
                <span>{a.tapped_count ?? 0} tapped</span>
                <span>{a.dismissed_count ?? 0} dismissed</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ReferralsPanel() {
  const [rows, setRows]       = useState(null);
  const [error, setError]     = useState(null);
  const [busy, setBusy]       = useState(false);
  const [notice, setNotice]   = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', code: '', rate: '20', flat: '' });

  const origin = (() => {
    try { return window.location.origin; } catch { return 'https://tracemate.art'; }
  })();

  const load = useCallback(async () => {
    try {
      const data = await listReferrers();
      setRows(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      setError(friendlyError(e, 'Could not load referrers.'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = useCallback((msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2500);
  }, []);

  const copy = useCallback((text, label) => {
    try {
      navigator.clipboard?.writeText(text);
      flash(`${label} copied`);
    } catch { flash('Copy failed — select manually'); }
  }, [flash]);

  const onCreate = useCallback(async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const payload = {
        name:  form.name.trim() || null,
        email: form.email.trim() || null,
      };
      if (form.code.trim()) payload.code = form.code.trim();
      // Flat overrides rate when present. Rate is entered as a percent.
      if (form.flat.trim() !== '') {
        payload.commission_flat_cents = Math.round(parseFloat(form.flat) * 100);
      } else {
        payload.commission_rate_bps = Math.round(parseFloat(form.rate || '0') * 100);
      }
      await createReferrer(payload);
      setForm({ name: '', email: '', code: '', rate: '20', flat: '' });
      setShowCreate(false);
      await load();
      flash('Partner created');
    } catch (err) {
      setError(friendlyError(err, 'Could not create partner.'));
    } finally {
      setBusy(false);
    }
  }, [form, load, flash]);

  const onToggleActive = useCallback(async (r) => {
    setBusy(true); setError(null);
    try {
      await updateReferrer(r.id, { active: !r.active });
      await load();
    } catch (err) {
      setError(friendlyError(err, 'Could not update partner.'));
    } finally { setBusy(false); }
  }, [load]);

  const onEditRate = useCallback(async (r) => {
    const cur = r.commission_flat_cents != null
      ? `flat ${(r.commission_flat_cents / 100).toFixed(2)}`
      : `${(Number(r.commission_rate_bps) || 0) / 100}`;
    const input = window.prompt(
      `Commission for "${r.code}".\nEnter a percent (e.g. 20) or "flat 2.50" for a fixed $ per sale.`,
      cur,
    );
    if (input == null) return;
    setBusy(true); setError(null);
    try {
      const m = input.trim().toLowerCase();
      if (m.startsWith('flat')) {
        const amt = parseFloat(m.replace('flat', '').trim());
        if (!Number.isFinite(amt)) throw new Error('Invalid flat amount');
        await updateReferrer(r.id, { commission_flat_cents: Math.round(amt * 100) });
      } else {
        const pct = parseFloat(m);
        if (!Number.isFinite(pct)) throw new Error('Invalid percent');
        // Clearing the flat override (null) so the percent takes effect.
        await updateReferrer(r.id, { commission_rate_bps: Math.round(pct * 100), commission_flat_cents: null });
      }
      await load();
      flash('Commission updated');
    } catch (err) {
      setError(friendlyError(err, 'Could not update commission.'));
    } finally { setBusy(false); }
  }, [load, flash]);

  const onMarkPaid = useCallback(async (r) => {
    if (!window.confirm(`Mark ${fmtCents(r.commission_pending_cents)} as paid to "${r.code}"? Do this after you've actually sent the money.`)) return;
    setBusy(true); setError(null);
    try {
      const n = await markCommissionsPaid(r.id);
      await load();
      flash(`Marked ${n} commission${n === 1 ? '' : 's'} paid`);
    } catch (err) {
      setError(friendlyError(err, 'Could not mark paid.'));
    } finally { setBusy(false); }
  }, [load, flash]);

  const totals = useMemo(() => {
    const list = rows ?? [];
    return list.reduce((acc, r) => ({
      signups: acc.signups + (Number(r.signups) || 0),
      sales:   acc.sales   + (Number(r.sales)   || 0),
      pending: acc.pending + (Number(r.commission_pending_cents) || 0),
      paid:    acc.paid    + (Number(r.commission_paid_cents)    || 0),
    }), { signups: 0, sales: 0, pending: 0, paid: 0 });
  }, [rows]);

  return (
    <section className="admin-stats" aria-labelledby="admin-ref-title">
      <header className="admin-stats-head">
        <h2 id="admin-ref-title">Referrals &amp; commissions</h2>
        <span className="admin-stats-when">
          give a partner their <code>{origin}/i/&lt;code&gt;</code> link. Signups
          and sales through it are tracked below; commission accrues on the first
          payment <em>and</em> every renewal. Pay them, then hit “Mark paid”.
        </span>
      </header>

      {notice && <p className="admin-ref-notice">{notice}</p>}
      {error && <p className="admin-error" style={{ margin: 12 }}>{error}</p>}

      <div className="admin-ref-toolbar">
        <button type="button" className="admin-ref-btn" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Cancel' : '+ New partner'}
        </button>
        <button type="button" className="admin-ref-btn admin-ref-btn-ghost" onClick={load} disabled={busy}>
          Refresh
        </button>
      </div>

      {showCreate && (
        <form className="admin-ref-create" onSubmit={onCreate}>
          <input
            className="admin-search" placeholder="Partner name"
            value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            className="admin-search" placeholder="Email (optional)"
            value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <input
            className="admin-search" placeholder="code (blank = auto)"
            value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          />
          <input
            className="admin-search" placeholder="% rate" style={{ width: 90 }}
            value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
            disabled={form.flat.trim() !== ''}
          />
          <input
            className="admin-search" placeholder="$ flat (overrides %)" style={{ width: 150 }}
            value={form.flat} onChange={(e) => setForm((f) => ({ ...f, flat: e.target.value }))}
          />
          <button type="submit" className="admin-ref-btn" disabled={busy}>Create</button>
        </form>
      )}

      {rows === null && !error ? (
        <div className="admin-stats-loading">
          <span className="admin-spinner" aria-hidden="true" />
          <span>Loading partners…</span>
        </div>
      ) : (rows && rows.length === 0) ? (
        <div className="admin-stats-empty" style={{ padding: 16 }}>
          No partners yet — create one and share their <code>/i/&lt;code&gt;</code> link.
        </div>
      ) : (
        <div className="admin-ref-table" role="table">
          <div className="admin-ref-row admin-ref-head" role="row">
            <span role="columnheader">Partner</span>
            <span role="columnheader">Rate</span>
            <span role="columnheader">Signups</span>
            <span role="columnheader">Paying</span>
            <span role="columnheader">Sales</span>
            <span role="columnheader">Owed</span>
            <span role="columnheader">Paid</span>
            <span role="columnheader">Actions</span>
          </div>
          {(rows ?? []).map((r) => (
            <div key={r.id} className={`admin-ref-row ${r.active ? '' : 'admin-ref-row-inactive'}`} role="row">
              <span className="admin-ref-partner" role="cell">
                <span className="admin-ref-code">/i/{r.code}</span>
                <span className="admin-ref-name">
                  {r.name || '—'}{!r.active && <span className="admin-ref-tag">disabled</span>}
                </span>
                <span className="admin-ref-links">
                  <button type="button" className="admin-ref-link" onClick={() => copy(`${origin}/i/${r.code}`, 'Referral link')}>
                    Copy link
                  </button>
                  {r.access_token && (
                    <button type="button" className="admin-ref-link" onClick={() => copy(`${origin}/partner?t=${r.access_token}`, 'Partner dashboard link')}>
                      Copy stats link
                    </button>
                  )}
                </span>
              </span>
              <span role="cell">
                <button type="button" className="admin-ref-link" onClick={() => onEditRate(r)} title="Edit commission">
                  {commissionLabel(r)}
                </button>
              </span>
              <span role="cell">{r.signups ?? 0}</span>
              <span role="cell">{r.paying_now ?? 0}</span>
              <span role="cell">{r.sales ?? 0}</span>
              <span role="cell"><strong>{fmtCents(r.commission_pending_cents)}</strong></span>
              <span role="cell">{fmtCents(r.commission_paid_cents)}</span>
              <span className="admin-ref-actions" role="cell">
                <button
                  type="button" className="admin-ref-btn admin-ref-btn-sm"
                  onClick={() => onMarkPaid(r)}
                  disabled={busy || !(Number(r.commission_pending_cents) > 0)}
                >
                  Mark paid
                </button>
                <button
                  type="button" className="admin-ref-link"
                  onClick={() => onToggleActive(r)} disabled={busy}
                >
                  {r.active ? 'Disable' : 'Enable'}
                </button>
              </span>
            </div>
          ))}
          <div className="admin-ref-row admin-ref-foot" role="row">
            <span role="cell"><strong>Total</strong></span>
            <span role="cell" />
            <span role="cell"><strong>{totals.signups}</strong></span>
            <span role="cell" />
            <span role="cell"><strong>{totals.sales}</strong></span>
            <span role="cell"><strong>{fmtCents(totals.pending)}</strong></span>
            <span role="cell"><strong>{fmtCents(totals.paid)}</strong></span>
            <span role="cell" />
          </div>
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/* Post-trace survey rollup. Counts answers from users who reached the survey
   after their first trace — the "how old" + "what they draw" pair lets the
   operator read the audience and steer content/pack creation. Pure client-
   side aggregation off the same users array, no extra fetch. */

const SURVEY_AGE_ORDER = ['13-17', '18-24', '25-34', '35-44', '45+'];
const SURVEY_AGE_LABEL = {
  '13-17': '13–17',
  '18-24': '18–24',
  '25-34': '25–34',
  '35-44': '35–44',
  '45+':   '45+',
};

// Draw categories — order is display order in the breakdown. Mirrors the
// record_survey whitelist + the ExitSurvey chip list.
const SURVEY_DRAW_ORDER = [
  'anime', 'characters', 'animals', 'portraits',
  'tattoos', 'nature', 'lettering', 'fanart', 'other',
];
const SURVEY_DRAW_LABEL = {
  anime:      { label: 'Anime / manga', emoji: '🌸' },
  characters: { label: 'Characters',    emoji: '🦸' },
  animals:    { label: 'Animals',       emoji: '🐾' },
  portraits:  { label: 'Portraits',     emoji: '🙂' },
  tattoos:    { label: 'Tattoos',       emoji: '🖤' },
  nature:     { label: 'Nature',        emoji: '🌿' },
  lettering:  { label: 'Lettering',     emoji: '✍️' },
  fanart:     { label: 'Fan art',       emoji: '⭐' },
  other:      { label: 'A bit of all',  emoji: '✨' },
};
const labelForAge  = (id) => SURVEY_AGE_LABEL[id] ?? id;
const labelForDraw = (id) => SURVEY_DRAW_LABEL[id]?.label ?? id;
const emojiForDraw = (id) => SURVEY_DRAW_LABEL[id]?.emoji ?? '✨';

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

function SurveyPanel({ users, onPickUser }) {
  // Filter state for the respondents list. 'all' = every respondent; an age
  // bucket or a draw category narrows down. Recomputed cheaply alongside the
  // rollup.
  const [filter, setFilter] = useState('all');
  // Incremental rendering — only mount a page of respondent cards at a time.
  const RESP_PAGE = 20;
  const [respShown, setRespShown] = useState(RESP_PAGE);
  useEffect(() => { setRespShown(RESP_PAGE); }, [filter]);

  const { ageRows, drawRows, totals, respondents } = useMemo(() => {
    if (!Array.isArray(users)) {
      return { ageRows: [], drawRows: [], totals: { responses: 0, eligible: 0 }, respondents: [] };
    }
    // Eligible = users who have traced at least once and therefore had the
    // chance to see the post-trace survey (it gates on trace_sessions >= 1).
    // Total users isn't the right denominator — ghosts who never opened
    // /trace genuinely never saw the gate.
    let eligible = 0;
    let responses = 0;
    const byAge = Object.fromEntries(SURVEY_AGE_ORDER.map((a) => [a, 0]));
    const byDraw = Object.fromEntries(SURVEY_DRAW_ORDER.map((d) => [d, 0]));
    const respondentList = [];

    for (const u of users) {
      if (Number(u?.trace_sessions ?? 0) >= 1) eligible += 1;
      if (!u?.survey_completed_at) continue;
      responses += 1;

      const age = (u.survey_age || '').trim();
      if (age in byAge) byAge[age] += 1;

      const draws = Array.isArray(u.survey_draws) ? u.survey_draws : [];
      for (const d of draws) {
        if (d in byDraw) byDraw[d] += 1;
      }

      respondentList.push({
        id: u.id,
        email: u.email,
        display_name: u.display_name,
        plan: u.plan ?? null,
        is_paid: !!u.is_paid,
        trace_sessions: u.trace_sessions ?? 0,
        total_trace_seconds: u.total_trace_seconds ?? 0,
        signup_source: u.signup_source ?? null,
        age,
        draws,
        note: typeof u.survey_note === 'string' ? u.survey_note.trim() : '',
        at: u.survey_completed_at,
      });
    }

    // Newest first — fresh answers are the most actionable.
    respondentList.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    const ages = SURVEY_AGE_ORDER
      .map((id) => ({ id, count: byAge[id] }))
      .filter((r) => r.count > 0);
    const draws = SURVEY_DRAW_ORDER
      .map((id) => ({ id, count: byDraw[id] }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);

    return {
      ageRows: ages,
      drawRows: draws,
      totals: { responses, eligible, byAge, byDraw },
      respondents: respondentList,
    };
  }, [users]);

  const responseRate = totals.eligible > 0
    ? Math.round((totals.responses / totals.eligible) * 100)
    : 0;

  const filteredRespondents = useMemo(() => {
    if (filter === 'all') return respondents;
    if (filter.startsWith('age:')) {
      const a = filter.slice(4);
      return respondents.filter((r) => r.age === a);
    }
    if (filter.startsWith('draw:')) {
      const d = filter.slice(5);
      return respondents.filter((r) => r.draws.includes(d));
    }
    return respondents;
  }, [respondents, filter]);

  const maxDraw = drawRows.length > 0 ? drawRows[0].count : 0;

  return (
    <section className="admin-stats" aria-labelledby="admin-survey-title">
      <header className="admin-stats-head">
        <h2 id="admin-survey-title">Post-trace survey</h2>
        <span className="admin-stats-when">
          one-time gate shown after a user's first trace. Age + what they like
          to draw — read the audience and steer which packs and references to
          build next.
        </span>
      </header>

      {totals.responses === 0 ? (
        <div className="admin-stats-empty" style={{ padding: 16 }}>
          No survey responses yet — the gate fires the next time a user opens
          /trace after their first trace.
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
            {ageRows.map((r) => {
              const pct = totals.responses > 0
                ? Math.round((r.count / totals.responses) * 100)
                : 0;
              return (
                <div key={r.id} className="admin-survey-summary-cell">
                  <span className="admin-survey-summary-num">{r.count}</span>
                  <span className="admin-survey-summary-lbl">{labelForAge(r.id)} · {pct}%</span>
                </div>
              );
            })}
          </div>

          <h3 className="admin-survey-section-title">What they like to draw</h3>
          <div className="admin-acq-table" role="table">
            <div className="admin-acq-row admin-acq-head" role="row">
              <span role="columnheader">Category</span>
              <span role="columnheader">Picks</span>
              <span role="columnheader">Share of respondents</span>
            </div>
            {drawRows.map((r) => {
              const pct = totals.responses > 0
                ? Math.round((r.count / totals.responses) * 100)
                : 0;
              const barPct = maxDraw > 0 ? Math.round((r.count / maxDraw) * 100) : 0;
              return (
                <div key={r.id} className="admin-acq-row" role="row">
                  <span className="admin-acq-source" role="cell">
                    <span aria-hidden="true">{emojiForDraw(r.id)}</span> {labelForDraw(r.id)}
                  </span>
                  <span role="cell">{r.count}</span>
                  <span role="cell" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        height: 8,
                        width: `${barPct}%`,
                        minWidth: 2,
                        borderRadius: 4,
                        background: 'var(--coral, #e87a7a)',
                      }}
                    />
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>

          <div className="admin-survey-respondents-head">
            <h3 className="admin-survey-section-title">
              Respondents <span className="admin-survey-section-count">{filteredRespondents.length}</span>
            </h3>
            <div className="admin-survey-filter-tabs" role="tablist" aria-label="Filter respondents">
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'all'}
                className={`admin-survey-filter-tab ${filter === 'all' ? 'is-active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All <span className="admin-survey-filter-count">{respondents.length}</span>
              </button>
              {ageRows.map((r) => (
                <button
                  key={`age:${r.id}`}
                  type="button"
                  role="tab"
                  aria-selected={filter === `age:${r.id}`}
                  className={`admin-survey-filter-tab ${filter === `age:${r.id}` ? 'is-active' : ''}`}
                  onClick={() => setFilter(`age:${r.id}`)}
                >
                  {labelForAge(r.id)} <span className="admin-survey-filter-count">{r.count}</span>
                </button>
              ))}
              {drawRows.map((r) => (
                <button
                  key={`draw:${r.id}`}
                  type="button"
                  role="tab"
                  aria-selected={filter === `draw:${r.id}`}
                  className={`admin-survey-filter-tab ${filter === `draw:${r.id}` ? 'is-active' : ''}`}
                  onClick={() => setFilter(`draw:${r.id}`)}
                >
                  {emojiForDraw(r.id)} {labelForDraw(r.id)} <span className="admin-survey-filter-count">{r.count}</span>
                </button>
              ))}
            </div>
          </div>

          <ul className="admin-survey-respondents">
            {filteredRespondents.slice(0, respShown).map((r) => {
              const planLabel = r.is_paid && r.plan
                ? PLAN_LABEL[r.plan] ?? r.plan
                : (r.plan === 'free' || !r.plan ? 'Free' : (PLAN_LABEL[r.plan] ?? r.plan));
              const planTone = r.is_paid ? 'paid' : 'free';
              return (
                <li key={r.id} className="admin-survey-respondent">
                  <div className="admin-survey-respondent-head">
                    <span className="admin-survey-respondent-feeling" aria-hidden="true">
                      {r.draws.length > 0 ? emojiForDraw(r.draws[0]) : '✨'}
                    </span>
                    <button
                      type="button"
                      className="admin-survey-respondent-who"
                      onClick={() => onPickUser?.(r.id)}
                      title={r.email || ''}
                    >
                      {r.display_name || (r.email ? r.email.split('@')[0] : 'unknown')}
                    </button>
                    <span className={`admin-survey-respondent-plan admin-survey-respondent-plan-${planTone}`}>
                      {planLabel}
                    </span>
                    <span className="admin-survey-respondent-meta">
                      <strong>{r.age ? labelForAge(r.age) : 'age n/a'}</strong>
                      {' · '}
                      {formatRelative(r.at)}
                    </span>
                  </div>
                  <div className="admin-survey-respondent-sub">
                    <span className="admin-survey-respondent-email" title={r.email || ''}>
                      {r.email || '—'}
                    </span>
                    <span className="admin-survey-respondent-stats">
                      {r.trace_sessions} {r.trace_sessions === 1 ? 'session' : 'sessions'}
                      {r.total_trace_seconds > 0 && ` · ${formatDuration(r.total_trace_seconds)} traced`}
                      {r.signup_source && ` · first-touch: ${labelForSource(r.signup_source)}`}
                    </span>
                  </div>
                  {r.draws.length > 0 && (
                    <p className="admin-survey-respondent-note">
                      Draws: {r.draws.map(labelForDraw).join(', ')}
                    </p>
                  )}
                  {r.note && (
                    <p className="admin-survey-respondent-note admin-survey-respondent-note-said">
                      <span className="admin-survey-respondent-note-tag">Note</span>
                      "{r.note}"
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {filteredRespondents.length > respShown && (
            <div className="admin-loadmore">
              <button
                type="button"
                className="admin-loadmore-btn"
                onClick={() => setRespShown((c) => c + RESP_PAGE)}
              >
                Load {Math.min(RESP_PAGE, filteredRespondents.length - respShown)} more
              </button>
              <span className="admin-loadmore-meta">
                Showing {Math.min(respShown, filteredRespondents.length)} of {filteredRespondents.length}
              </span>
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

/* ─────────────────────────────────────────────────────────────────────── */
/* Gallery panel — moderate the community creations feed (C1/C2/C3). Admins   */
/* can delete any creation (DB policy added in the note+admin migration).      */
/* ─────────────────────────────────────────────────────────────────────── */
/* Overview — the at-a-glance home. Pulls the headline numbers (money, funnel,
   live, sources) into ONE screen so the operator rarely needs the deep tabs.
   Stats come from useAdminMeta() (passed in); visitor/funnel/channel/geo come
   from a single getAnalytics('7d') fetch this panel owns.                    */

// country-code → flag emoji (regional indicator pair). 🌐 for unknown.
function ccFlag(cc) {
  if (!cc || cc.length !== 2) return '🌐';
  try {
    return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)));
  } catch { return '🌐'; }
}

// Compact money for headline tiles: $1.2k / $980 (no cents on big numbers).
function compactMoney(cents, currency = 'USD') {
  const n = (Number(cents) || 0) / 100;
  const sym = currency === 'USD' ? '$' : '';
  if (n >= 1000) return `${sym}${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `${sym}${n % 1 === 0 ? n : n.toFixed(2)}`;
}

function OverviewPanel({ users, stats, health, onPickUser, onGoTo }) {
  const [an, setAn] = useState(null);
  const [anErr, setAnErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAnalytics('7d')
      .then((r) => { if (!cancelled) setAn(r.overview); })
      .catch(() => { if (!cancelled) setAnErr(true); });
    return () => { cancelled = true; };
  }, []);

  const real = useMemo(() => (users || []).filter((u) => !u.is_admin), [users]);
  const liveUsers = useMemo(
    () => real
      .filter((u) => isOnline(u.last_seen_at))
      .sort((a, b) => (isTracingNow(b) ? 1 : 0) - (isTracingNow(a) ? 1 : 0)),
    [real],
  );
  const onlineCount  = liveUsers.length;
  const tracingCount = liveUsers.filter(isTracingNow).length;

  const rev    = stats?.revenue || {};
  const fn     = stats?.funnel || {};
  const totals = an?.totals || {};
  const afn    = an?.funnel || {};

  const visitors = totals.visitors ?? afn.visitors ?? 0;
  const signups  = totals.signups ?? afn.signups ?? 0;
  const paidNow  = fn.currently_paid ?? real.filter((u) => u.is_paid).length;
  const live     = totals.live ?? onlineCount;
  const newV     = totals.new_visitors ?? 0;
  const retV     = totals.returning_visitors ?? 0;
  const convPct  = visitors ? Math.round((signups / visitors) * 100) : 0;

  // Funnel (visitors → signups → paid) over the 7d window.
  const fVisitors = afn.visitors ?? visitors;
  const fSignups  = afn.signups ?? signups;
  const fPaid     = afn.paid ?? 0;
  const fMax      = Math.max(fVisitors, 1);
  const pct = (n, base) => (base ? Math.round((n / base) * 100) : 0);

  const channels = (an?.by_channel || []).slice().sort((a, b) => (b.visitors || 0) - (a.visitors || 0)).slice(0, 6);
  const chMax = Math.max(1, ...channels.map((c) => c.visitors || 0));
  const countries = (an?.by_country || []).slice().sort((a, b) => (b.visitors || 0) - (a.visitors || 0)).slice(0, 6);
  const coMax = Math.max(1, ...countries.map((c) => c.visitors || 0));

  // 14-day trend from get_admin_stats activity (signups + paid).
  const days = stats?.activity || [];
  const dMax = Math.max(1, ...days.map((d) => d.signups || 0));

  const plans = rev.plans || {};
  const planEntries = Object.entries(plans);

  // Alerts.
  const stuck = health?.stuck_24h_count || 0;
  const atRisk = (stats?.at_risk || []).length;

  return (
    <>
      {/* Alerts strip */}
      {(stuck > 0 || atRisk > 0) && (
        <div className="adm-alerts">
          {stuck > 0 && (
            <div className="adm-alert adm-alert-danger">
              <span className="adm-alert-ico">⚠️</span>
              <span><b>{stuck}</b> webhook{stuck === 1 ? '' : 's'} stuck over 24h — payments may not be syncing.</span>
              <button type="button" className="adm-alert-act" onClick={() => onGoTo('operations')}>View health →</button>
            </div>
          )}
          {atRisk > 0 && (
            <div className="adm-alert adm-alert-warn">
              <span className="adm-alert-ico">🫥</span>
              <span><b>{atRisk}</b> paying user{atRisk === 1 ? '' : 's'} inactive 14+ days — renewal risk.</span>
              <button type="button" className="adm-alert-act" onClick={() => onGoTo('operations')}>See who →</button>
            </div>
          )}
        </div>
      )}

      {/* KPI row */}
      <div className="adm-kpis">
        <div className="adm-kpi adm-kpi-blue">
          <span className="adm-kpi-label">Visitors · 7d</span>
          <span className="adm-kpi-value">{visitors.toLocaleString()}</span>
          <span className="adm-kpi-sub">{newV} new · {retV} returning</span>
        </div>
        <div className="adm-kpi adm-kpi-violet">
          <span className="adm-kpi-label">Signups · 7d</span>
          <span className="adm-kpi-value">{signups.toLocaleString()}</span>
          <span className="adm-kpi-sub">{convPct}% of visitors</span>
        </div>
        <div className="adm-kpi adm-kpi-green">
          <span className="adm-kpi-label">Paying now</span>
          <span className="adm-kpi-value">{paidNow.toLocaleString()}</span>
          <span className="adm-kpi-sub"><b>+{rev.paid_this_week || 0}</b> this week</span>
        </div>
        <div className="adm-kpi adm-kpi-coral">
          <span className="adm-kpi-label">MRR</span>
          <span className="adm-kpi-value">{compactMoney(rev.mrr_cents)}</span>
          <span className="adm-kpi-sub">{compactMoney(rev.lifetime_revenue_cents)} lifetime</span>
        </div>
        <div className="adm-kpi adm-kpi-amber">
          <span className="adm-kpi-label">Live now</span>
          <span className="adm-kpi-value">{live}</span>
          <span className="adm-kpi-sub">{tracingCount} tracing</span>
        </div>
      </div>

      <div className="adm-grid" style={{ marginTop: 16 }}>
        {/* Funnel */}
        <div className="adm-card">
          <div className="adm-card-h"><span className="adm-card-title">Conversion funnel</span><span className="adm-card-meta">last 7 days</span></div>
          {anErr ? <p className="adm-empty">Couldn’t load analytics.</p> : !an ? <p className="adm-empty">Loading…</p> : (
            <div className="adm-funnel">
              {[
                { k: 'Visitors', v: fVisitors, cls: 'f1', base: null },
                { k: 'Signups',  v: fSignups,  cls: 'f2', base: fVisitors },
                { k: 'Paid',     v: fPaid,     cls: 'f3', base: fSignups },
              ].map((r2) => (
                <div className="adm-funnel-row" key={r2.k}>
                  <span className="adm-funnel-label">{r2.k}</span>
                  <div className="adm-funnel-track">
                    <div className={`adm-funnel-fill ${r2.cls}`} style={{ width: `${Math.max(2, pct(r2.v, fMax))}%` }}>
                      {r2.v.toLocaleString()}
                    </div>
                  </div>
                  <span className="adm-funnel-pct">
                    {r2.base == null ? '—' : `${pct(r2.v, r2.base)}%`}
                    {r2.base != null && <small>of {r2.k === 'Signups' ? 'visitors' : 'signups'}</small>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Money */}
        <div className="adm-card">
          <div className="adm-card-h"><span className="adm-card-title">Revenue</span><span className="adm-card-meta">{paidNow} paying</span></div>
          <div className="adm-money">
            <div className="adm-money-cell"><span className="adm-money-k">MRR</span><span className="adm-money-v">{compactMoney(rev.mrr_cents)}</span></div>
            <div className="adm-money-cell"><span className="adm-money-k">Lifetime</span><span className="adm-money-v">{compactMoney(rev.lifetime_revenue_cents)}</span></div>
            <div className="adm-money-cell"><span className="adm-money-k">New today</span><span className="adm-money-v">{rev.paid_today || 0}</span></div>
            <div className="adm-money-cell"><span className="adm-money-k">This month</span><span className="adm-money-v">{rev.paid_this_month || 0}</span></div>
          </div>
          {planEntries.length > 0 && (
            <div className="adm-chips">
              {planEntries.map(([plan, n]) => (
                <span className="adm-chip" key={plan}>{PLAN_LABEL[plan] ?? plan} <b>{n}</b></span>
              ))}
            </div>
          )}
        </div>

        {/* Trend */}
        <div className="adm-card">
          <div className="adm-card-h"><span className="adm-card-title">Daily signups</span><span className="adm-card-meta">last 14 days</span></div>
          {days.length === 0 ? <p className="adm-empty">No data yet.</p> : (
            <>
              <div className="adm-trend">
                {days.map((d) => (
                  <div className="adm-trend-col" key={d.date} title={`${d.date} · ${d.signups} signups · ${d.paid} paid`}>
                    {d.paid > 0 && <div className="adm-trend-bar t2" style={{ height: `${pct(d.paid, dMax)}%` }} />}
                    <div className="adm-trend-bar" style={{ height: `${Math.max(2, pct(d.signups, dMax))}%` }} />
                    <span className="adm-trend-day">{d.date.slice(8)}</span>
                  </div>
                ))}
              </div>
              <div className="adm-legend">
                <span><i style={{ background: 'var(--adm-coral)' }} />Signups</span>
                <span><i style={{ background: 'var(--adm-green)' }} />Paid</span>
              </div>
            </>
          )}
        </div>

        {/* Top channels */}
        <div className="adm-card">
          <div className="adm-card-h"><span className="adm-card-title">Top sources</span><span className="adm-card-meta">visitors · 7d</span></div>
          {!an ? <p className="adm-empty">Loading…</p> : channels.length === 0 ? <p className="adm-empty">No traffic yet.</p> : (
            <div className="adm-bars">
              {channels.map((c) => (
                <div className="adm-bar-row" key={c.name || 'direct'}>
                  <span className="adm-bar-name">{c.name || 'direct'}</span>
                  <div className="adm-bar-track"><div className="adm-bar-fill" style={{ width: `${pct(c.visitors, chMax)}%` }} /></div>
                  <span className="adm-bar-val">{c.visitors}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top countries */}
        <div className="adm-card">
          <div className="adm-card-h"><span className="adm-card-title">Top countries</span><span className="adm-card-meta">visitors · 7d</span></div>
          {!an ? <p className="adm-empty">Loading…</p> : countries.length === 0 ? <p className="adm-empty">No geo yet.</p> : (
            <div className="adm-bars">
              {countries.map((c) => (
                <div className="adm-bar-row" key={c.country_code || c.country || '??'}>
                  <span className="adm-bar-name"><span className="adm-bar-flag">{ccFlag(c.country_code)}</span>{c.country || c.country_code || 'Unknown'}</span>
                  <div className="adm-bar-track"><div className="adm-bar-fill c2" style={{ width: `${pct(c.visitors, coMax)}%` }} /></div>
                  <span className="adm-bar-val">{c.visitors}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live now feed */}
        <div className="adm-card">
          <div className="adm-card-h"><span className="adm-card-title">Live right now</span><span className="adm-card-meta">{onlineCount} online · {tracingCount} tracing</span></div>
          {liveUsers.length === 0 ? <p className="adm-empty">Nobody’s online right now.</p> : (
            <div className="adm-feed">
              {liveUsers.slice(0, 8).map((u) => {
                const tracing = isTracingNow(u);
                return (
                  <div className="adm-feed-row" key={u.id} onClick={() => onPickUser(u.id)}>
                    <span className={`adm-feed-dot ${tracing ? 'tracing' : ''}`} />
                    <div className="adm-feed-who">
                      <div className="adm-feed-email">{u.email || '—'}</div>
                      <div className="adm-feed-meta">{u.current_page ? `on /${u.current_page}` : 'online'}{u.is_paid ? ' · paid' : ''}</div>
                    </div>
                    {tracing && <span className="adm-feed-badge">tracing</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
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
  // Primary navigation — 4 sections, each grouping related views under one
  // secondary sub-tab bar instead of a sprawl of sibling top-level tabs.
  //   Overview · People (user directory) · Insights (all analytics) ·
  //   Operations (revenue, referrals, content moderation, announcements)
  const [section, setSection]   = useState('overview'); // overview|people|insights|operations
  const [anaTab, setAnaTab]      = useState('overview'); // overview|deep|sources|survey
  const [opsTab, setOpsTab]      = useState('revenue');  // revenue|referrals|announce|gallery|traced|reviews|library

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
          { id: 'overview',   label: 'Overview',   ico: '📊' },
          { id: 'people',     label: 'People',     ico: '👥' },
          { id: 'insights',   label: 'Insights',   ico: '📈' },
          { id: 'operations', label: 'Operations', ico: '🛠️' },
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
        {/* ── Overview ─────────────────────────────────────────────────── */}
        {section === 'overview' && (
          <OverviewPanel
            users={users}
            stats={meta.stats}
            health={meta.health}
            onPickUser={(uid) => setExpanded(uid)}
            onGoTo={(s) => setSection(s)}
          />
        )}

        {/* ── Insights (all analytics: pulse · deep dive · sources · survey) */}
        {section === 'insights' && (
          <>
            <div className="adm-sub">
              {[
                { id: 'overview', label: 'Pulse overview' },
                { id: 'deep',     label: 'Deep dive' },
                { id: 'sources',  label: 'Sources' },
                { id: 'survey',   label: 'Survey' },
              ].map((t) => (
                <button key={t.id} type="button"
                  className={`adm-sub-tab ${anaTab === t.id ? 'is-active' : ''}`}
                  onClick={() => setAnaTab(t.id)}>{t.label}</button>
              ))}
            </div>
            <div className="adm-panel-host">
              {anaTab === 'overview' && <AnalyticsPulse />}
              {anaTab === 'deep' && (
                <Suspense fallback={<p className="pulse-empty">Loading detailed analytics…</p>}>
                  <AnalyticsPulseDetail />
                </Suspense>
              )}
              {anaTab === 'sources' && <AcquisitionPanel users={users} />}
              {anaTab === 'survey'  && <SurveyPanel users={users} onPickUser={(uid) => setExpanded(uid)} />}
            </div>
          </>
        )}

        {/* ── Operations (revenue · referrals · announcements · content) ── */}
        {section === 'operations' && (
          <>
            <div className="adm-sub">
              {[
                { id: 'revenue',   label: 'Revenue' },
                { id: 'referrals', label: 'Referrals' },
                { id: 'announce',  label: 'Announcements' },
                { id: 'gallery',   label: 'Gallery' },
                { id: 'traced',    label: 'Traced' },
                { id: 'reviews',   label: 'Reviews' },
                { id: 'library',   label: 'Library' },
              ].map((t) => (
                <button key={t.id} type="button"
                  className={`adm-sub-tab ${opsTab === t.id ? 'is-active' : ''}`}
                  onClick={() => setOpsTab(t.id)}>{t.label}</button>
              ))}
            </div>
            <div className="adm-panel-host">
              {opsTab === 'revenue' && (
                <>
                  {/* Payment/webhook health folded in here (was its own tab) —
                      stuck payments also raise an Overview alert, so a dedicated
                      tab that's empty "Webhooks healthy" most of the time was
                      pure IA overhead. Shown above revenue so it's still
                      impossible to miss when something IS stuck. */}
                  {meta.health && <WebhookHealthPanel data={meta.health} />}
                  <MoneyRevenuePanel stats={meta.stats} />
                </>
              )}
              {opsTab === 'referrals' && <ReferralsPanel />}
              {opsTab === 'announce'  && <AnnouncementsPanel />}
              {opsTab === 'gallery'   && <GalleryPanel />}
              {opsTab === 'traced'    && <TracedPanel />}
              {opsTab === 'reviews'   && <ReviewsPanel />}
              {opsTab === 'library'   && <LibraryPanel />}
            </div>
          </>
        )}

        {/* ── People (user directory; Survey lives under Insights now) ─── */}
        {section === 'people' && (
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
      </main>

      {expandedUser && (
        <ActivityDrawer user={expandedUser} onClose={() => setExpanded(null)} />
      )}
    </div>
  );
}
