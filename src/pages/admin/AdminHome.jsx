import { useEffect, useMemo, useState } from 'react';
import { getAnalytics } from '../../lib/admin.js';
import { getTracedImages } from '../../lib/creations.js';
import {
  formatRelative, formatMoney, isOnline, isTracingNow,
  userStage, STAGE_DEFS, PAGE_LABEL,
} from './adminLib.js';
import '../../styles/admin-home.css';

/**
 * Admin "Dashboard" — the command center. Leads with what the operator tracks:
 *  1) Visitor actions  — funnel, top pages, top sources, engagement (from the
 *     anonymous analytics rollup).
 *  2) User actions & content — recent signups + funnel stage, survey snapshot,
 *     recently traced images.
 * Revenue / live-now ride along as a compact top strip. Built to render cleanly
 * on an empty dataset (analytics starts at zero after a wipe).
 */

const RANGE = { label: '7 days', from: () => new Date(Date.now() - 7 * 864e5).toISOString() };
const pct = (n, d) => (d > 0 ? Math.round((100 * n) / d) : 0);

function Bars({ rows, labelKey, valueKey, max, empty }) {
  if (!rows || rows.length === 0) return <p className="admh-empty">{empty}</p>;
  const top = max ?? rows.reduce((m, r) => Math.max(m, Number(r[valueKey]) || 0), 1);
  return (
    <ul className="admh-bars">
      {rows.map((r, i) => {
        const v = Number(r[valueKey]) || 0;
        return (
          <li key={i} className="admh-bar-row">
            <span className="admh-bar-label" title={String(r[labelKey] ?? '')}>{r[labelKey] || '—'}</span>
            <span className="admh-bar-track"><span className="admh-bar-fill" style={{ width: `${pct(v, top)}%` }} /></span>
            <span className="admh-bar-val">{v.toLocaleString()}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function AdminHome({ users, stats, onPickUser, onGoTo }) {
  const [ov, setOv] = useState(null);
  const [traced, setTraced] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [a, t] = await Promise.allSettled([
          getAnalytics('7d'),
          getTracedImages(12),
        ]);
        if (cancelled) return;
        if (a.status === 'fulfilled') setOv(a.value?.overview ?? null);
        if (t.status === 'fulfilled') setTraced(t.value?.items ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const totals = ov?.totals ?? {};
  const funnel = ov?.funnel ?? {};

  // Real (non-admin) users for the people-side cards.
  const real = useMemo(() => (Array.isArray(users) ? users.filter((u) => !u.is_admin) : []), [users]);
  const onlineUsers = useMemo(
    () => real.filter((u) => isOnline(u.last_seen_at)).slice(0, 8),
    [real],
  );
  const recentSignups = useMemo(
    () => real.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 8),
    [real],
  );
  const survey = useMemo(() => {
    const respondents = real.filter((u) => u.survey_completed_at);
    const ages = {};
    for (const u of respondents) if (u.survey_age) ages[u.survey_age] = (ages[u.survey_age] || 0) + 1;
    const ageRows = Object.entries(ages).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
    return { count: respondents.length, ageRows };
  }, [real]);

  const revenue = stats?.revenue ?? {};
  const paying = Number(revenue.currently_paid ?? funnel.paid ?? 0);
  const mrr = revenue.mrr_cents != null ? formatMoney(revenue.mrr_cents) : null;

  const kpis = [
    { label: 'Visitors', sub: '7d', val: (totals.visitors ?? 0).toLocaleString() },
    { label: 'Signups', sub: '7d', val: (totals.signups ?? 0).toLocaleString() },
    { label: 'Paying', sub: 'now', val: paying.toLocaleString() },
    ...(mrr ? [{ label: 'MRR', sub: 'est.', val: mrr }] : []),
    { label: 'Live', sub: 'now', val: onlineUsers.length, live: true },
  ];

  return (
    <div className="admh">
      {/* ── KPI strip ─────────────────────────────────────────────── */}
      <div className="admh-kpis">
        {kpis.map((k) => (
          <div key={k.label} className={`admh-kpi ${k.live ? 'is-live' : ''}`}>
            <span className="admh-kpi-val">{k.live && <span className="admh-dot" />}{k.val}</span>
            <span className="admh-kpi-label">{k.label}<i>{k.sub}</i></span>
          </div>
        ))}
      </div>

      {/* ── Visitor actions ───────────────────────────────────────── */}
      <section className="admh-section">
        <header className="admh-head">
          <h2>Visitor actions <span className="admh-range">· last {RANGE.label}</span></h2>
          <button type="button" className="admh-link" onClick={() => onGoTo?.('people')}>Visitor analytics →</button>
        </header>
        <div className="admh-grid admh-grid-3">
          <div className="admh-card">
            <h3>Funnel</h3>
            {loading ? <p className="admh-empty">Loading…</p> : (
              <div className="admh-funnel">
                <FunnelStep label="Visitors" value={funnel.visitors ?? 0} pctOf={null} />
                <FunnelStep label="Signups"  value={funnel.signups ?? 0}  pctOf={pct(funnel.signups ?? 0, funnel.visitors ?? 0)} />
                <FunnelStep label="Paid"     value={funnel.paid ?? 0}     pctOf={pct(funnel.paid ?? 0, funnel.signups ?? 0)} />
              </div>
            )}
          </div>
          <div className="admh-card">
            <h3>Top pages</h3>
            {loading ? <p className="admh-empty">Loading…</p>
              : <Bars rows={(ov?.by_page ?? []).slice(0, 6)} labelKey="path" valueKey="views" empty="No page views yet." />}
          </div>
          <div className="admh-card">
            <h3>Where they come from</h3>
            {loading ? <p className="admh-empty">Loading…</p>
              : <Bars rows={(ov?.by_channel ?? []).slice(0, 6)} labelKey="channel" valueKey="visitors" empty="No traffic yet." />}
          </div>
        </div>
      </section>

      {/* ── User actions & content ────────────────────────────────── */}
      <section className="admh-section">
        <header className="admh-head">
          <h2>Users &amp; content</h2>
          <button type="button" className="admh-link" onClick={() => onGoTo?.('people')}>All users →</button>
        </header>
        <div className="admh-grid admh-grid-2">
          <div className="admh-card">
            <h3>Recent signups</h3>
            {recentSignups.length === 0 ? <p className="admh-empty">No signups yet.</p> : (
              <ul className="admh-people">
                {recentSignups.map((u) => {
                  const stage = userStage(u);
                  const def = STAGE_DEFS[stage];
                  return (
                    <li key={u.id}>
                      <button type="button" className="admh-person" onClick={() => onPickUser?.(u.id)}>
                        <span className="admh-person-who">
                          <span className="admh-person-email">{u.email ?? '—'}</span>
                          <span className="admh-person-when">{formatRelative(u.created_at)}</span>
                        </span>
                        <span className={`admh-tag admh-tag-${u.is_paid ? 'paid' : def.tone}`}>
                          {u.is_paid ? 'Paid' : def.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="admh-card">
            <h3>Survey <span className="admh-range">· {survey.count} replies</span></h3>
            {survey.ageRows.length === 0
              ? <p className="admh-empty">No survey answers yet.</p>
              : <Bars rows={survey.ageRows} labelKey="k" valueKey="v" empty="No survey answers yet." />}
          </div>
        </div>

        <div className="admh-card admh-card-wide">
          <h3>Recently traced</h3>
          {loading ? <p className="admh-empty">Loading…</p>
            : (traced && traced.length > 0 ? (
              <div className="admh-traced">
                {traced.slice(0, 12).map((it) => (
                  <img key={it.id} src={it.url} alt={it.label || ''} loading="lazy" decoding="async" />
                ))}
              </div>
            ) : <p className="admh-empty">No traced images yet.</p>)}
        </div>
      </section>

      {/* ── Live now ──────────────────────────────────────────────── */}
      <section className="admh-section">
        <header className="admh-head"><h2>Live now <span className="admh-range">· {onlineUsers.length} online</span></h2></header>
        <div className="admh-card admh-card-wide">
          {onlineUsers.length === 0 ? <p className="admh-empty">Nobody's online right now.</p> : (
            <ul className="admh-live">
              {onlineUsers.map((u) => {
                const tracing = isTracingNow(u);
                const where = tracing ? `Tracing${u.current_image_label ? ` "${u.current_image_label}"` : ''}`
                  : (u.current_page && PAGE_LABEL[u.current_page] ? `On ${PAGE_LABEL[u.current_page]}` : 'In the app');
                return (
                  <li key={u.id}>
                    <button type="button" className="admh-live-row" onClick={() => onPickUser?.(u.id)}>
                      <span className={`admh-presence ${tracing ? 'is-tracing' : ''}`} />
                      <span className="admh-live-email">{u.email ?? '—'}</span>
                      <span className="admh-live-where">{where}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function FunnelStep({ label, value, pctOf }) {
  return (
    <div className="admh-fstep">
      <span className="admh-fstep-val">{Number(value).toLocaleString()}</span>
      <span className="admh-fstep-label">{label}</span>
      {pctOf != null && <span className="admh-fstep-pct">{pctOf}%</span>}
    </div>
  );
}
