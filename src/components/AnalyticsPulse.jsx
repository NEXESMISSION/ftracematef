// AnalyticsPulse — the "super analytics" tab for /admin-me.
//
// One screen for the whole top-of-funnel: where anonymous visitors come from
// (source/referrer), what they're on (device/os/browser), WHERE on Earth they
// are (a live rotating globe), how the funnel converts (visitor → signup →
// paid), and how they actually deal with a given page (click heatmap + scroll
// funnel + rage hotspots).
//
// Data comes from one admin-analytics call (getAnalytics) returning the rollup;
// drilling into a page issues a second call with that path to fetch its
// heatmap. The 3D globe is `cobe` (tiny WebGL), lazy-loaded only inside this
// admin-only chunk so it never weighs on the public bundle.

import { useEffect, useMemo, useRef, useState } from 'react';
import createGlobe from 'cobe';
import { getAnalytics, listVisitors, getVisitorProfile } from '../lib/admin.js';
import { friendlyError } from '../lib/errors.js';

const RANGES = [
  { id: '24h', label: '24h' },
  { id: '7d',  label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'all', label: 'All time' },
];

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : '0');
const pct = (num, den) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—');

// Icon per named channel (from analytics_channel() in the DB). Anything not
// listed falls back to a neutral dot, so adding a channel server-side doesn't
// require a client change.
const CHANNEL_ICON = {
  ChatGPT: '🤖', Perplexity: '🤖', Gemini: '🤖', Claude: '🤖', Copilot: '🤖',
  Google: '🔍', Bing: '🔍', DuckDuckGo: '🔍', Yahoo: '🔍', Ecosia: '🔍',
  'Brave Search': '🔍', Yandex: '🔍',
  YouTube: '▶️', TikTok: '🎵', Instagram: '📸', Facebook: '👥',
  'X (Twitter)': '✖️', Reddit: '👽', Pinterest: '📌', LinkedIn: '💼',
  Threads: '🧵', Telegram: '✈️', WhatsApp: '💬', Discord: '🎮',
  GitHub: '🐙', 'Product Hunt': '🐱', Gmail: '✉️', Outlook: '✉️',
  Newsletter: '📰', Direct: '🔗',
};
const channelIcon = (name) => CHANNEL_ICON[name] || '•';

/* ── interactive globe ────────────────────────────────────────────────────── */
// Drag to spin: horizontal drag rotates longitude (phi), vertical drag tilts
// (theta). While the pointer is down, the idle auto-rotation pauses; on release
// it resumes from wherever you left it. Works with mouse and touch (Pointer
// Events). `r` (the dragged phi offset) and `theta` live in refs so the cobe
// onRender loop reads the latest values without re-creating the globe.
function Globe({ countries }) {
  const canvasRef = useRef(null);
  // Drag state shared with the render loop (refs → no re-render, no re-init).
  const pointerDrag = useRef(null);   // { x, y, r, theta } while dragging, else null
  const rRef = useRef(0);             // accumulated horizontal rotation offset
  const thetaRef = useRef(0.25);      // current tilt

  const markers = useMemo(() => {
    const valid = (countries || []).filter(
      (c) => typeof c.lat === 'number' && typeof c.lon === 'number',
    );
    const max = valid.reduce((m, c) => Math.max(m, c.visitors || 0), 1);
    return valid.slice(0, 120).map((c) => ({
      location: [c.lat, c.lon],
      size: Math.min(0.1, 0.02 + ((c.visitors || 0) / max) * 0.08),
    }));
  }, [countries]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let phi = 0;
    let width = canvas.offsetWidth || 400;
    const onResize = () => { width = canvas.offsetWidth || 400; };
    window.addEventListener('resize', onResize);

    // ── drag handlers ────────────────────────────────────────────────────────
    const onPointerDown = (e) => {
      pointerDrag.current = { x: e.clientX, y: e.clientY, r: rRef.current, theta: thetaRef.current };
      canvas.style.cursor = 'grabbing';
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e) => {
      const p = pointerDrag.current;
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      rRef.current = p.r + dx / 150;
      // Clamp tilt so the globe can't flip past the poles.
      thetaRef.current = Math.max(-0.6, Math.min(0.8, p.theta + dy / 250));
    };
    const onPointerUp = (e) => {
      pointerDrag.current = null;
      canvas.style.cursor = 'grab';
      canvas.releasePointerCapture?.(e.pointerId);
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.style.cursor = 'grab';

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: 0.25,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 6,
      baseColor: [0.28, 0.30, 0.34],
      markerColor: [0.95, 0.45, 0.20],
      glowColor: [0.18, 0.20, 0.24],
      markers,
      onRender: (state) => {
        // Idle auto-spin only when not actively dragging.
        if (!pointerDrag.current) phi += 0.0045;
        state.phi = phi + rRef.current;
        state.theta = thetaRef.current;
        state.width = width * 2;
        state.height = width * 2;
      },
    });
    return () => {
      globe.destroy();
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [markers]);

  return (
    <canvas
      ref={canvasRef}
      className="pulse-globe-canvas"
      style={{ width: '100%', aspectRatio: '1 / 1', touchAction: 'none', cursor: 'grab' }}
    />
  );
}

/* ── horizontal bar breakdown ─────────────────────────────────────────────── */
function Breakdown({ title, rows, labelKey, valueKey = 'visitors' }) {
  const max = (rows || []).reduce((m, r) => Math.max(m, r[valueKey] || 0), 1);
  return (
    <div className="pulse-card">
      <h4 className="pulse-card-title">{title}</h4>
      {(!rows || rows.length === 0) ? (
        <p className="pulse-empty">No data yet.</p>
      ) : (
        <ul className="pulse-bars">
          {rows.map((r, i) => (
            <li key={i} className="pulse-bar-row">
              <span className="pulse-bar-label" title={String(r[labelKey])}>{r[labelKey]}</span>
              <span className="pulse-bar-track">
                <span className="pulse-bar-fill" style={{ width: `${((r[valueKey] || 0) / max) * 100}%` }} />
              </span>
              <span className="pulse-bar-value">{fmt(r[valueKey])}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── click-density heat canvas ────────────────────────────────────────────── */
// Renders normalised click points (0..1 in both axes) as additive radial
// blobs on a tall canvas mimicking a scrolled page. Hand-rolled so we pull in
// no heatmap dependency.
function HeatCanvas({ points }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d0f12';
    ctx.fillRect(0, 0, W, H);
    if (!points || points.length === 0) return;

    // Additive heat: each click is a soft radial gradient; overlapping clicks
    // build toward white-hot.
    ctx.globalCompositeOperation = 'lighter';
    const R = Math.max(14, W * 0.03);
    for (const p of points) {
      const x = Math.max(0, Math.min(1, p.x)) * W;
      const y = Math.max(0, Math.min(1, p.y)) * H;
      const g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, 'rgba(255,120,40,0.35)');
      g.addColorStop(0.5, 'rgba(255,80,30,0.18)');
      g.addColorStop(1, 'rgba(255,40,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }, [points]);

  return (
    <canvas
      ref={canvasRef}
      width={360}
      height={560}
      className="pulse-heatcanvas"
      style={{ width: '100%', maxWidth: 360 }}
    />
  );
}

/* ── scroll-depth funnel ──────────────────────────────────────────────────── */
function ScrollFunnel({ scroll, pageviews }) {
  const base = Math.max(pageviews || 0, scroll?.d25 || 0, 1);
  const rows = [
    { label: 'Reached 25%',  v: scroll?.d25 || 0 },
    { label: 'Reached 50%',  v: scroll?.d50 || 0 },
    { label: 'Reached 75%',  v: scroll?.d75 || 0 },
    { label: 'Reached 100%', v: scroll?.d100 || 0 },
  ];
  return (
    <div className="pulse-card">
      <h4 className="pulse-card-title">Scroll depth</h4>
      <ul className="pulse-bars">
        {rows.map((r, i) => (
          <li key={i} className="pulse-bar-row">
            <span className="pulse-bar-label">{r.label}</span>
            <span className="pulse-bar-track">
              <span className="pulse-bar-fill pulse-bar-fill-blue" style={{ width: `${(r.v / base) * 100}%` }} />
            </span>
            <span className="pulse-bar-value">{fmt(r.v)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── main ─────────────────────────────────────────────────────────────────── */
export default function AnalyticsPulse() {
  const [range, setRange] = useState('7d');
  const [view, setView] = useState('overview'); // 'overview' | 'visitors'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [heatPath, setHeatPath] = useState('/welcome');
  const [heat, setHeat] = useState(null);
  const [heatLoading, setHeatLoading] = useState(false);

  // Overview load (on range change).
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    getAnalytics(range)
      .then((res) => { if (alive) setData(res.overview); })
      .catch((e) => { if (alive) setError(friendlyError(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range]);

  // Heatmap load (on range or selected path change).
  useEffect(() => {
    if (!heatPath) return;
    let alive = true;
    setHeatLoading(true);
    getAnalytics(range, heatPath)
      .then((res) => { if (alive) setHeat(res.heatmap); })
      .catch(() => { if (alive) setHeat(null); })
      .finally(() => { if (alive) setHeatLoading(false); });
    return () => { alive = false; };
  }, [range, heatPath]);

  const t = data?.totals || {};
  const funnel = data?.funnel || {};
  const countries = data?.by_country || [];
  const pages = data?.by_page || [];

  return (
    <section className="admin-stats pulse" aria-labelledby="pulse-title">
      <header className="admin-stats-head">
        <h2 id="pulse-title" className="admin-stats-title">Pulse — visitor analytics</h2>
        <div className="pulse-range" role="tablist" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={range === r.id}
              className={`pulse-range-btn ${range === r.id ? 'is-active' : ''}`}
              onClick={() => setRange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {/* Overview (stacked rollups) ⇆ Visitors (per-individual drill-down). */}
      <div className="pulse-range" role="tablist" aria-label="View" style={{ marginBottom: 12 }}>
        {[{ id: 'overview', label: 'Overview' }, { id: 'visitors', label: 'Visitors' }].map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            className={`pulse-range-btn ${view === v.id ? 'is-active' : ''}`}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'visitors' && <VisitorsPanel range={range} />}

      {view === 'overview' && error && <p className="admin-error" role="alert">{error}</p>}
      {view === 'overview' && loading && !data && <p className="pulse-empty">Loading analytics…</p>}

      {view === 'overview' && data && (
        <>
          {/* KPI tiles */}
          <div className="pulse-kpis">
            <Kpi label="Visitors" value={fmt(t.visitors)} sub={`${fmt(t.new_visitors)} new · ${fmt(t.returning_visitors)} returning`} />
            <Kpi label="Sessions" value={fmt(t.sessions)} />
            <Kpi label="Pageviews" value={fmt(t.pageviews)} />
            <Kpi label="Signups" value={fmt(t.signups)} sub={`${pct(t.signups, t.visitors)} of visitors`} />
            <Kpi label="Live now" value={fmt(t.live)} accent />
          </div>

          {/* Globe + country ranking */}
          <div className="pulse-geo">
            <div className="pulse-card pulse-globe-card">
              <h4 className="pulse-card-title">Where visitors are</h4>
              <Globe countries={countries} />
            </div>
            <div className="pulse-card">
              <h4 className="pulse-card-title">Top countries</h4>
              {countries.length === 0 ? <p className="pulse-empty">No geo data yet.</p> : (
                <ol className="pulse-country-list">
                  {countries.slice(0, 12).map((c) => (
                    <li key={c.country_code} className="pulse-country-row">
                      <span className="pulse-country-name">{c.country || c.country_code}</span>
                      <span className="pulse-country-count">{fmt(c.visitors)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          {/* Acquisition funnel */}
          <div className="pulse-card pulse-funnel">
            <h4 className="pulse-card-title">Acquisition funnel ({range})</h4>
            <div className="pulse-funnel-row">
              <FunnelStep label="Visitors" value={funnel.visitors} base={funnel.visitors} />
              <FunnelStep label="Signed up" value={funnel.signups} base={funnel.visitors} />
              <FunnelStep label="Paid" value={funnel.paid} base={funnel.visitors} />
            </div>
          </div>

          {/* Channels — the headline "where did they come from" view. */}
          <div className="pulse-card pulse-channels">
            <h4 className="pulse-card-title">Channels — where visitors came from</h4>
            {(!data.by_channel || data.by_channel.length === 0) ? (
              <p className="pulse-empty">No data yet.</p>
            ) : (
              <ul className="pulse-bars">
                {(() => {
                  const max = data.by_channel.reduce((m, r) => Math.max(m, r.visitors || 0), 1);
                  return data.by_channel.map((r, i) => (
                    <li key={i} className="pulse-bar-row pulse-channel-row">
                      <span className="pulse-bar-label">
                        <span className="pulse-channel-icon" aria-hidden="true">{channelIcon(r.channel)}</span>
                        {r.channel}
                      </span>
                      <span className="pulse-bar-track">
                        <span className="pulse-bar-fill" style={{ width: `${((r.visitors || 0) / max) * 100}%` }} />
                      </span>
                      <span className="pulse-bar-value">{fmt(r.visitors)}</span>
                    </li>
                  ));
                })()}
              </ul>
            )}
          </div>

          {/* Breakdowns */}
          <div className="pulse-grid">
            <Breakdown title="Traffic source (tagged links)" rows={data.by_source} labelKey="source" />
            <Breakdown title="Came from (referrer)" rows={data.by_referrer} labelKey="referrer" />
            <Breakdown title="Device" rows={data.by_device} labelKey="device_type" />
            <Breakdown title="Operating system" rows={data.by_os} labelKey="os" />
            <Breakdown title="Browser" rows={data.by_browser} labelKey="browser" />
            <Breakdown title="Language" rows={data.by_language} labelKey="lang" />
            <Breakdown title="Top pages" rows={pages} labelKey="path" valueKey="views" />
          </div>

          {/* Heatmap viewer */}
          <div className="pulse-card pulse-heat">
            <div className="pulse-heat-head">
              <h4 className="pulse-card-title">Page heatmap</h4>
              <select
                className="pulse-heat-select"
                value={heatPath}
                onChange={(e) => setHeatPath(e.target.value)}
              >
                {[...new Set(['/welcome', '/', '/pricing', '/how-to-use', ...pages.map((p) => p.path)])].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {heatLoading && <p className="pulse-empty">Loading heatmap…</p>}
            {heat && (
              <div className="pulse-heat-body">
                <div className="pulse-heat-left">
                  <p className="pulse-heat-stat">
                    {fmt(heat.clicks)} clicks · {fmt(heat.pageviews)} views
                  </p>
                  <HeatCanvas points={heat.points} />
                </div>
                <div className="pulse-heat-right">
                  <ScrollFunnel scroll={heat.scroll} pageviews={heat.pageviews} />
                  <Breakdown title="Most-clicked elements" rows={heat.top_elements} labelKey="sel" valueKey="clicks" />
                  {heat.rage?.length > 0 && (
                    <Breakdown title="Rage clicks (frustration)" rows={heat.rage} labelKey="sel" valueKey="count" />
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/* ── per-visitor drill-down ───────────────────────────────────────────────── */
const thCell = { padding: '6px 8px', fontWeight: 600, whiteSpace: 'nowrap' };
const tdCell = { padding: '6px 8px', verticalAlign: 'top' };
const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  padding: '5vh 16px', overflowY: 'auto',
};
const modal = {
  background: '#15181d', border: '1px solid #2a2e35', borderRadius: 12,
  padding: 20, width: '100%', maxWidth: 720, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
};
const badge = (bg) => ({ padding: '1px 6px', borderRadius: 6, fontSize: 11, background: bg, color: '#fff', whiteSpace: 'nowrap' });
const chip = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, fontSize: 12, background: '#1b1f25', border: '1px solid #262b33', whiteSpace: 'nowrap' };

const shortRef = (ref) => {
  if (!ref) return '(direct)';
  const s = String(ref).replace(/^https?:\/\//, '').replace(/^www\./, '');
  return s.length > 42 ? `${s.slice(0, 42)}…` : s;
};
const fmtDate = (s) => { try { return new Date(s).toLocaleString(); } catch { return '—'; } };
const fmtTime = (s) => {
  try {
    return new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
};
function accountCell(r) {
  if (!r.signed_up) return <span style={{ opacity: 0.5 }}>anonymous</span>;
  const who = r.email || r.display_name || 'account';
  return (
    <span>
      {who}
      {r.paid
        ? <span style={{ ...badge('#1f7a3d'), marginLeft: 6 }}>{r.plan}</span>
        : <span style={{ ...badge('#3a3f47'), marginLeft: 6 }}>free</span>}
    </span>
  );
}

function VisitorsPanel({ range }) {
  const PAGE = 50;
  const [list, setList] = useState({ total: 0, rows: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [offset, setOffset] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [onlySignedUp, setOnlySignedUp] = useState(false);
  const [selected, setSelected] = useState(null);

  // Reset paging whenever the range or a filter changes.
  useEffect(() => { setOffset(0); }, [range, search, onlySignedUp]);

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr('');
    listVisitors(range, { limit: PAGE, offset, onlySignedUp, search })
      .then((res) => { if (alive) setList(res); })
      .catch((e) => { if (alive) setErr(friendlyError(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range, offset, onlySignedUp, search]);

  const rows = list.rows || [];
  const total = list.total || 0;
  const page = Math.floor(offset / PAGE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="pulse-card">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input
          type="search"
          placeholder="Search email, city, country, source, referrer…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ flex: '1 1 240px', padding: '8px 10px', borderRadius: 8, border: '1px solid #2a2e35', background: '#0d0f12', color: '#e8e8e8' }}
        />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, opacity: 0.85 }}>
          <input type="checkbox" checked={onlySignedUp} onChange={(e) => setOnlySignedUp(e.target.checked)} />
          Signed-up only
        </label>
        <span style={{ fontSize: 13, opacity: 0.7 }}>{fmt(total)} visitors</span>
      </div>

      {err && <p className="admin-error" role="alert">{err}</p>}
      {loading && <p className="pulse-empty">Loading visitors…</p>}
      {!loading && rows.length === 0 && !err && <p className="pulse-empty">No visitors match.</p>}

      {!loading && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', opacity: 0.6 }}>
                <th style={thCell}>Channel</th>
                <th style={thCell}>Came from</th>
                <th style={thCell}>Location</th>
                <th style={thCell}>Device</th>
                <th style={thCell}>Account</th>
                <th style={thCell}>Last seen</th>
                <th style={thCell} aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.visitor_id} style={{ borderTop: '1px solid #1d2127' }}>
                  <td style={tdCell}><span style={{ marginRight: 6 }} aria-hidden="true">{channelIcon(r.channel)}</span>{r.channel || '—'}</td>
                  <td style={tdCell} title={r.referrer || ''}>{shortRef(r.referrer)}</td>
                  <td style={tdCell}>{[r.city, r.country].filter(Boolean).join(', ') || '—'}</td>
                  <td style={tdCell}>{[r.device_type, r.os].filter(Boolean).join(' · ') || '—'}</td>
                  <td style={tdCell}>{accountCell(r)}</td>
                  <td style={tdCell}>{fmtDate(r.last_seen_at)}</td>
                  <td style={tdCell}>
                    <button type="button" className="pulse-range-btn" onClick={() => setSelected(r.visitor_id)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="pulse-range-btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Prev</button>
          <span style={{ fontSize: 13, opacity: 0.7 }}>Page {page} / {pages}</span>
          <button type="button" className="pulse-range-btn" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Next</button>
        </div>
      )}

      {selected && <VisitorProfile visitorId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.45 }}>{label}</div>
      <div style={{ fontSize: 13, marginTop: 3, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

/* Collapse the raw firehose into one node per page-visit: a `pageview` starts a
   step; scrolls fold into a single max-depth; clicks/identify/rage/custom nest
   under the step as actions. Turns ~90 noisy rows into a readable journey. */
function groupTimeline(events) {
  const groups = [];
  let cur = null;
  for (const e of events || []) {
    const t = e.created_at;
    if (e.type === 'pageview') {
      cur = { path: e.path || '/', start: t, end: t, maxScroll: 0, actions: [] };
      groups.push(cur);
    } else {
      if (!cur) { cur = { path: e.path || '/', start: t, end: t, maxScroll: 0, actions: [] }; groups.push(cur); }
      cur.end = t;
      if (e.type === 'scroll') {
        const d = Number(e.props?.depth) || 0;
        if (d > cur.maxScroll) cur.maxScroll = d;
      } else {
        cur.actions.push(e);
      }
    }
  }
  return groups;
}

const ACTION_META = {
  click:    { icon: '👆', color: '#f0a83a' },
  identify: { icon: '🔑', color: '#27ae60' },
  rage:     { icon: '😡', color: '#e0524b' },
  custom:   { icon: '✨', color: '#9b7bd4' },
};
const clip = (s, n = 56) => (s && s.length > n ? `${s.slice(0, n)}…` : s);
// A label like "div.trace-overlay-wrap" / "button.lib-close" is a CSS selector,
// not human text — show it muted/monospace rather than as a quoted action.
const isSelectorLabel = (s) => !!s && /^(div|button|input|span|a|svg|img|ul|li|p|section|label|form)[.#]/i.test(s);

function ActionRow({ e }) {
  const meta = ACTION_META[e.type] || ACTION_META.custom;
  let label;
  if (e.type === 'identify') {
    label = <em style={{ color: '#27ae60' }}>Signed in</em>;
  } else if (e.type === 'rage') {
    label = <>Rage click <span style={{ fontFamily: 'monospace', opacity: 0.55 }}>{clip(e.props?.sel, 32)}</span></>;
  } else if (e.type === 'custom') {
    label = clip(e.props?.name || 'event');
  } else { // click
    const raw = e.props?.txt || e.props?.sel || '';
    label = (!e.props?.txt && isSelectorLabel(raw))
      ? <span style={{ fontFamily: 'monospace', opacity: 0.5 }}>{clip(raw, 40)}</span>
      : <span>“{clip(raw)}”</span>;
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '2px 0', fontSize: 13 }}>
      <span style={{ width: 16, textAlign: 'center', flexShrink: 0 }} aria-hidden="true">{meta.icon}</span>
      <span style={{ minWidth: 0 }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.35, flexShrink: 0 }}>{fmtTime(e.created_at)}</span>
    </div>
  );
}

function ScrollChip({ depth }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, opacity: 0.7 }}>
      <span style={{ position: 'relative', width: 42, height: 5, borderRadius: 3, background: '#2a2e35', overflow: 'hidden' }}>
        <span style={{ position: 'absolute', inset: 0, width: `${depth}%`, background: '#4a8cff' }} />
      </span>
      scrolled {depth}%
    </span>
  );
}

function durationStr(a, b) {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (!isFinite(ms) || ms < 1000) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function VisitorProfile({ visitorId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr('');
    getVisitorProfile(visitorId)
      .then((p) => { if (alive) setProfile(p); })
      .catch((e) => { if (alive) setErr(friendlyError(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [visitorId]);

  const v = profile?.visitor || null;
  const events = profile?.events || [];
  const steps = useMemo(() => groupTimeline(events), [events]);

  const signedUp = !!(v && v.user_id);
  const name = v ? (v.display_name || v.email || (signedUp ? 'Account' : 'Anonymous visitor')) : '';
  const initial = (v?.display_name || v?.email || '?').trim().charAt(0).toUpperCase() || '🌐';
  const conv = !v ? null
    : v.paid ? { label: 'PAID', bg: '#1f7a3d' }
    : signedUp ? { label: 'MEMBER', bg: '#2d6cdf' }
    : { label: 'ANONYMOUS', bg: '#3a3f47' };

  return (
    <div onClick={onClose} style={overlay} role="dialog" aria-modal="true">
      <div onClick={(e) => e.stopPropagation()} style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h4 className="pulse-card-title" style={{ margin: 0 }}>Visitor journey</h4>
          <button type="button" className="pulse-range-btn" onClick={onClose}>Close</button>
        </div>

        {err && <p className="admin-error" role="alert">{err}</p>}
        {loading && <p className="pulse-empty">Loading…</p>}

        {v && (
          <>
            {/* Identity header */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
              <div style={{
                width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 700, color: '#fff',
                background: signedUp ? 'linear-gradient(135deg,#3a6df0,#7b4dd4)' : '#3a3f47',
              }}>{initial}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  <span style={chip}>{channelIcon(v.channel)} {v.channel || '—'}</span>
                  {(v.city || v.country) && <span style={chip}>📍 {[v.city, v.country].filter(Boolean).join(', ')}</span>}
                  <span style={chip}>🖥 {[v.device_type, v.os].filter(Boolean).join(' · ') || '—'}</span>
                </div>
              </div>
              {conv && <span style={{ ...badge(conv.bg), fontSize: 12, padding: '4px 10px', letterSpacing: 0.5 }}>{conv.label}</span>}
            </div>

            {/* Compact facts */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12,
              padding: 14, marginBottom: 18, borderRadius: 10, background: '#0f1216', border: '1px solid #20242b',
            }}>
              <Field label="Came from" value={shortRef(v.referrer)} />
              <Field label="Landing page" value={v.landing_path || '—'} />
              <Field label="Source / campaign" value={[v.source, v.campaign].filter(Boolean).join(' · ') || '—'} />
              <Field label="Account" value={signedUp ? (v.email || v.display_name || 'account') : 'anonymous'} />
              <Field label="Plan" value={signedUp ? `${v.plan || 'free'}${v.paid ? ' · paid' : ''}` : '—'} />
              <Field label="Language · TZ" value={[v.lang, v.tz].filter(Boolean).join(' · ') || '—'} />
              <Field label="First seen" value={fmtDate(v.first_seen_at)} />
              <Field label="Time on site" value={durationStr(v.first_seen_at, v.last_seen_at)} />
              <Field label="Sessions · pageviews" value={`${fmt(v.sessions)} · ${fmt(v.pageviews)}`} />
            </div>

            {/* Step-by-step page journey */}
            <h4 className="pulse-card-title">Journey — {steps.length} {steps.length === 1 ? 'page' : 'pages'}</h4>
            {steps.length === 0 ? <p className="pulse-empty">No events recorded.</p> : (
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 360, overflowY: 'auto', position: 'relative' }}>
                {steps.map((g, i) => (
                  <li key={i} style={{ position: 'relative', paddingLeft: 30, paddingBottom: i === steps.length - 1 ? 0 : 16 }}>
                    {/* connector line */}
                    {i !== steps.length - 1 && (
                      <span style={{ position: 'absolute', left: 9, top: 20, bottom: 0, width: 2, background: '#262b33' }} />
                    )}
                    {/* step number dot */}
                    <span style={{
                      position: 'absolute', left: 0, top: 1, width: 20, height: 20, borderRadius: '50%',
                      background: '#2d6cdf', color: '#fff', fontSize: 11, fontWeight: 600,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{i + 1}</span>
                    {/* step header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 14 }}>{g.path}</strong>
                      <span style={{ fontSize: 11, opacity: 0.45 }}>{fmtTime(g.start)}</span>
                      {g.maxScroll > 0 && <ScrollChip depth={g.maxScroll} />}
                    </div>
                    {/* nested actions */}
                    {g.actions.length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        {g.actions.map((e, j) => <ActionRow key={j} e={e} />)}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent }) {
  return (
    <div className={`pulse-kpi ${accent ? 'pulse-kpi-accent' : ''}`}>
      <span className="pulse-kpi-label">{label}</span>
      <span className="pulse-kpi-value">{value}</span>
      {sub && <span className="pulse-kpi-sub">{sub}</span>}
    </div>
  );
}

function FunnelStep({ label, value, base }) {
  const v = value || 0;
  return (
    <div className="pulse-funnel-step">
      <span className="pulse-funnel-value">{fmt(v)}</span>
      <span className="pulse-funnel-label">{label}</span>
      <span className="pulse-funnel-pct">{pct(v, base)}</span>
    </div>
  );
}
