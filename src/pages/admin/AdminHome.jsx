import { useEffect, useMemo, useState } from 'react';
import { getAnalytics } from '../../lib/admin.js';
import {
  formatRelative, formatMoney, isOnline,
  userStage, STAGE_DEFS, PAGE_LABEL,
} from './adminLib.js';
import '../../styles/admin-home.css';

/**
 * Admin "Dashboard" — the command center. Lean and signal-first: a KPI strip,
 * the conversion funnel (the thing a founder actually optimizes), top pages +
 * top sources, and recent signups. No vanity walls, no duplicate live list —
 * the deep views live one click away under People / Manage.
 */

const pct = (n, d) => (d > 0 ? Math.round((100 * n) / d) : 0);
const money = (cents) => formatMoney(cents ?? 0);

// '/upload' → 'Upload', '/' → 'Home', else the raw path.
function pageLabel(path) {
  if (!path || path === '/') return 'Home';
  return PAGE_LABEL[path.replace(/^\//, '')] ?? path;
}

function Bars({ rows, labelKey, valueKey, labelFn, empty }) {
  if (!rows || rows.length === 0) return <p className="admh-empty">{empty}</p>;
  const top = rows.reduce((m, r) => Math.max(m, Number(r[valueKey]) || 0), 1);
  return (
    <ul className="admh-bars">
      {rows.map((r, i) => {
        const v = Number(r[valueKey]) || 0;
        const label = labelFn ? labelFn(r[labelKey]) : (r[labelKey] || '—');
        return (
          <li key={i} className="admh-bar-row">
            <span className="admh-bar-label" title={String(r[labelKey] ?? '')}>{label}</span>
            <span className="admh-bar-track"><span className="admh-bar-fill" style={{ width: `${pct(v, top)}%` }} /></span>
            <span className="admh-bar-val">{v.toLocaleString()}</span>
          </li>
        );
      })}
    </ul>
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

export default function AdminHome({ users, stats, onPickUser, onGoTo }) {
  const [ov, setOv] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAnalytics('7d')
      .then((a) => { if (!cancelled) setOv(a?.overview ?? null); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const totals = ov?.totals ?? {};
  const funnel = ov?.funnel ?? {};

  const real = useMemo(() => (Array.isArray(users) ? users.filter((u) => !u.is_admin) : []), [users]);
  const onlineCount = useMemo(() => real.filter((u) => isOnline(u.last_seen_at)).length, [real]);
  const recentSignups = useMemo(
    () => real.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 10),
    [real],
  );

  const revenue = stats?.revenue ?? {};
  const paying = Number(revenue.currently_paid ?? funnel.paid ?? 0);

  // Revenue reads Paying → MRR; MRR always renders (never vanishes).
  const kpis = [
    { label: 'Visitors', sub: '7d', val: (totals.visitors ?? 0).toLocaleString() },
    { label: 'Signups', sub: '7d', val: (totals.signups ?? 0).toLocaleString() },
    { label: 'Paying', sub: 'now', val: paying.toLocaleString() },
    { label: 'MRR', sub: 'monthly', val: money(revenue.mrr_cents) },
    { label: 'Live', sub: 'now', val: onlineCount, live: true },
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

      {/* ── Funnel-led row: the founder's core signals ───────────────── */}
      <section className="admh-section">
        <header className="admh-head">
          <h2>Conversion <span className="admh-range">· last 7 days</span></h2>
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
              : <Bars rows={(ov?.by_page ?? []).slice(0, 5)} labelKey="path" valueKey="views" labelFn={pageLabel} empty="No page views yet." />}
          </div>
          <div className="admh-card">
            <h3>Top sources</h3>
            {loading ? <p className="admh-empty">Loading…</p>
              : <Bars rows={(ov?.by_channel ?? []).slice(0, 5)} labelKey="channel" valueKey="visitors" empty="No traffic yet." />}
          </div>
        </div>
      </section>

      {/* ── Recent signups (full width) ──────────────────────────────── */}
      <section className="admh-section">
        <header className="admh-head">
          <h2>Recent signups</h2>
          <button type="button" className="admh-link" onClick={() => onGoTo?.('people')}>All users →</button>
        </header>
        <div className="admh-card admh-card-wide">
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
      </section>
    </div>
  );
}
