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
import { getAnalytics } from '../lib/admin.js';
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

/* ── rotating globe ───────────────────────────────────────────────────────── */
function Globe({ countries }) {
  const canvasRef = useRef(null);
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
        state.phi = phi;
        phi += 0.0045;
        state.width = width * 2;
        state.height = width * 2;
      },
    });
    return () => { globe.destroy(); window.removeEventListener('resize', onResize); };
  }, [markers]);

  return (
    <canvas
      ref={canvasRef}
      className="pulse-globe-canvas"
      style={{ width: '100%', aspectRatio: '1 / 1' }}
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

      {error && <p className="admin-error" role="alert">{error}</p>}
      {loading && !data && <p className="pulse-empty">Loading analytics…</p>}

      {data && (
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

          {/* Breakdowns */}
          <div className="pulse-grid">
            <Breakdown title="Traffic source" rows={data.by_source} labelKey="source" />
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
