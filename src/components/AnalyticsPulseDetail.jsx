// AnalyticsPulseDetail — the admin's full visitor-analytics page (was "Pulse 2").
// tab. Where Pulse is the at-a-glance visual page, this is the full firehose:
// every breakdown (channels / sources / referrers / countries / devices / OS /
// browsers / languages), per-page engagement with on-demand click heatmaps +
// scroll funnels, the PWA-install and Lifetime funnels, the daily trend, and the
// per-visitor drill-down table.
//
// OPTIMISED FOR ON-DEMAND LOADING. The page makes ONE lightweight rollup call
// (getAnalytics) on mount / range change — that powers every breakdown without
// extra requests. The genuinely expensive work is gated behind collapsible
// sections so it never runs until the operator opens it:
//   • the Visitors table self-fetches only once its section is expanded;
//   • a page's click heatmap is fetched only when you click that page;
//   • the whole module is React.lazy-loaded by AdminDashboard, so its (and
//     cobe's) bytes never touch the default admin chunk.
// Collapsed sections render nothing — `{open && <Body/>}` — so the DOM stays
// small and no child effect fires until it is needed.

import { useEffect, useState } from 'react';
import { getAnalytics } from '../lib/admin.js';
import { friendlyError } from '../lib/errors.js';
import {
  RANGES, fmt, pct,
  Breakdown, HeatCanvas, ScrollFunnel, InstallFunnel,
  VisitorsPanel, DownloadReport, Kpi, FunnelStep,
} from './AnalyticsPulse.jsx';

/* ── collapsible section ──────────────────────────────────────────────────── */
// The body is mounted ONLY while open, so a collapsed section costs nothing and
// its data-fetching children (heatmaps, the visitor table) stay dormant until
// the operator actually expands them. `count` shows a quick tally in the header
// so you can scan what's inside without opening it.
function Section({ id, title, subtitle, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`pulse2-section ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="pulse2-sec-head"
        aria-expanded={open}
        aria-controls={`pulse2-${id}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="pulse2-sec-toggle" aria-hidden="true">{open ? '−' : '+'}</span>
        <span className="pulse2-sec-title">{title}</span>
        {subtitle && <span className="pulse2-sec-sub">{subtitle}</span>}
        {count != null && <span className="pulse2-sec-count">{count}</span>}
      </button>
      {open && (
        <div className="pulse2-sec-body" id={`pulse2-${id}`}>
          {children}
        </div>
      )}
    </section>
  );
}

/* ── on-demand per-page heatmap ───────────────────────────────────────────── */
// Fetches a single page's heatmap (click points + scroll funnel + most-clicked
// + rage) only when this component mounts — i.e. only when the operator selects
// the page. One page in flight at a time keeps the payload bounded.
function PageHeatmap({ range, path }) {
  const [heat, setHeat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(''); setHeat(null);
    getAnalytics(range, path)
      .then((res) => { if (alive) setHeat(res.heatmap); })
      .catch((e) => { if (alive) setErr(friendlyError(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range, path]);

  if (loading) return <p className="pulse-empty">Loading heatmap for {path}…</p>;
  if (err) return <p className="admin-error" role="alert">{err}</p>;
  if (!heat || (!heat.clicks && !heat.pageviews)) {
    return <p className="pulse-empty">No interaction data captured for {path} in this range.</p>;
  }

  return (
    <div className="pulse2-heat">
      <div className="pulse2-heat-canvas">
        <h4 className="pulse-card-title">Click density — {path}</h4>
        <HeatCanvas points={heat.points} />
        <p className="pulse-empty">{fmt(heat.clicks)} clicks · {fmt(heat.pageviews)} views</p>
      </div>
      <div className="pulse2-heat-side">
        <ScrollFunnel scroll={heat.scroll} />
        <div className="pulse-card">
          <h4 className="pulse-card-title">Most-clicked elements</h4>
          {(!heat.top_elements || heat.top_elements.length === 0) ? (
            <p className="pulse-empty">No clicks recorded.</p>
          ) : (
            <ul className="pulse-bars">
              {(() => {
                const max = heat.top_elements.reduce((m, e) => Math.max(m, e.clicks || 0), 1);
                return heat.top_elements.slice(0, 12).map((e, i) => (
                  <li key={i} className="pulse-bar-row">
                    <span className="pulse-bar-label" title={e.txt || e.sel}>{e.txt || e.sel || '—'}</span>
                    <span className="pulse-bar-track">
                      <span className="pulse-bar-fill" style={{ width: `${((e.clicks || 0) / max) * 100}%` }} />
                    </span>
                    <span className="pulse-bar-value">{fmt(e.clicks)}</span>
                  </li>
                ));
              })()}
            </ul>
          )}
        </div>
        {heat.rage?.length > 0 && (
          <div className="pulse-card">
            <h4 className="pulse-card-title">Rage clicks — frustration hotspots</h4>
            <ul className="pulse-bars">
              {(() => {
                // Scale each bar by count/max so the chart actually encodes
                // magnitude. Previously every bar was hardcoded to width:100%,
                // making the visualization meaningless (only the number varied).
                const rageMax = heat.rage.reduce((m, e) => Math.max(m, e.count || 0), 1);
                return heat.rage.slice(0, 8).map((e, i) => (
                  <li key={i} className="pulse-bar-row">
                    <span className="pulse-bar-label" title={e.sel}>😡 {e.sel || '—'}</span>
                    <span className="pulse-bar-track">
                      <span className="pulse-bar-fill pulse-bar-fill-rage" style={{ width: `${((e.count || 0) / rageMax) * 100}%` }} />
                    </span>
                    <span className="pulse-bar-value">{fmt(e.count)}</span>
                  </li>
                ));
              })()}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── pages explorer ───────────────────────────────────────────────────────── */
// Lists every page from the rollup (views + unique visitors). Selecting a row
// mounts PageHeatmap, which fetches that page's detail on demand. Nothing heavy
// loads until a page is picked.
function PagesExplorer({ range, pages }) {
  const [selected, setSelected] = useState(null);
  const rows = pages || [];
  const max = rows.reduce((m, p) => Math.max(m, p.views || 0), 1);

  if (rows.length === 0) return <p className="pulse-empty">No page data yet.</p>;

  return (
    <>
      <p className="pulse-empty">Click a page to load its click heatmap, scroll funnel and rage hotspots — loaded on demand, one at a time.</p>
      <ul className="pulse-bars pulse2-pages">
        {rows.map((p, i) => (
          <li key={i} className={`pulse-bar-row pulse2-page-row ${selected === p.path ? 'is-selected' : ''}`}>
            <button type="button" className="pulse2-page-btn" onClick={() => setSelected(selected === p.path ? null : p.path)}>
              <span className="pulse-bar-label" title={p.path}>{p.path}</span>
              <span className="pulse-bar-track">
                <span className="pulse-bar-fill" style={{ width: `${((p.views || 0) / max) * 100}%` }} />
              </span>
              <span className="pulse-bar-value">{fmt(p.views)}<span className="pulse2-page-uv"> · {fmt(p.visitors)} uv</span></span>
            </button>
          </li>
        ))}
      </ul>
      {selected && <PageHeatmap range={range} path={selected} />}
    </>
  );
}

/* ── daily trend ──────────────────────────────────────────────────────────── */
// A compact dual-bar sparkline of the timeseries the rollup already returns —
// visitors (coral) over pageviews (muted) per day. Pure SVG, no chart lib.
function Timeseries({ series }) {
  const data = series || [];
  if (data.length === 0) return <p className="pulse-empty">No daily data in this range.</p>;
  const maxV = data.reduce((m, d) => Math.max(m, d.visitors || 0, d.pageviews || 0), 1);
  return (
    <div className="pulse2-trend">
      <div className="pulse2-trend-bars">
        {data.map((d, i) => {
          const day = String(d.day || '').slice(0, 10);
          return (
            <div key={i} className="pulse2-trend-col" title={`${day} — ${fmt(d.visitors)} visitors · ${fmt(d.pageviews)} pageviews`}>
              <span className="pulse2-trend-pv" style={{ height: `${((d.pageviews || 0) / maxV) * 100}%` }} />
              <span className="pulse2-trend-v" style={{ height: `${((d.visitors || 0) / maxV) * 100}%` }} />
            </div>
          );
        })}
      </div>
      <div className="pulse2-trend-legend">
        <span><i className="pulse2-dot pulse2-dot-v" /> Visitors</span>
        <span><i className="pulse2-dot pulse2-dot-pv" /> Pageviews</span>
        <span className="pulse-empty">{data.length} days</span>
      </div>
    </div>
  );
}

/* ── plain-English summary ──────────────────────────────────────────────────── */
// Reads the rollup into one sentence — the "so what" that sits above the numbers,
// so the page answers itself before you open a single section.
function summarize(t, channels, pages, range) {
  const v = t.visitors || 0;
  const span = range === 'all' ? 'All time' : `Last ${RANGES.find((r) => r.id === range)?.label || range}`;
  if (!v) return `${span}: no visitors yet — share your link to start tracking.`;
  const n = (count, word) => `${fmt(count)} ${word}${(count || 0) === 1 ? '' : 's'}`;
  const top = (rows, key) => (rows || []).reduce((a, b) => ((b?.[key] || 0) > (a?.[key] || 0) ? b : a), null);
  const ch = top(channels, 'visitors');
  const pg = top(pages, 'views');
  let s = `${span}: ${n(v, 'visitor')} (${fmt(t.new_visitors)} new) · ${n(t.sessions, 'session')} · ${n(t.pageviews, 'pageview')}. `;
  s += t.signups ? `${fmt(t.signups)} signed up (${pct(t.signups, v)} of visitors). ` : 'No signups yet. ';
  if (ch) s += `Top source: ${ch.channel} (${fmt(ch.visitors)}). `;
  if (pg) s += `Busiest page: ${pg.path} (${fmt(pg.views)} views).`;
  return s.trim();
}

/* ── main ─────────────────────────────────────────────────────────────────── */
export default function AnalyticsPulseDetail() {
  const [range, setRange] = useState('7d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // The single lightweight rollup that powers every breakdown below. The heavy
  // detail (per-visitor journeys, per-page heatmaps) is NOT fetched here — those
  // load lazily inside their own sections only when opened.
  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    getAnalytics(range)
      .then((res) => { if (alive) setData(res.overview); })
      .catch((e) => { if (alive) setError(friendlyError(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range]);

  const t = data?.totals || {};
  const funnel = data?.funnel || {};
  const pages = data?.by_page || [];

  const ppsLabel = t.sessions ? (t.pageviews / t.sessions).toFixed(2) : '—';

  return (
    <section className="admin-stats pulse pulse2" aria-labelledby="pulse2-title">
      <header className="admin-stats-head">
        <div>
          <h2 id="pulse2-title" className="admin-stats-title">Visitor analytics</h2>
          <p className="pulse2-lede">Every visitor, session and source — in depth. Open only the sections you need; the heavy detail loads on demand.</p>
        </div>
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
          {/* TL;DR — the whole page in one sentence, read straight from the rollup. */}
          <p className="pulse2-summary">{summarize(t, data.by_channel, pages, range)}</p>

          {/* Summary KPIs — cheap, always visible. */}
          <div className="pulse-kpis">
            <Kpi label="Visitors" value={fmt(t.visitors)} sub={`${fmt(t.new_visitors)} new · ${fmt(t.returning_visitors)} returning`} />
            <Kpi label="Sessions" value={fmt(t.sessions)} sub={`${ppsLabel} pages / session`} />
            <Kpi label="Pageviews" value={fmt(t.pageviews)} />
            <Kpi label="Events" value={fmt(t.events)} />
            <Kpi label="Signups" value={fmt(t.signups)} sub={`${pct(t.signups, t.visitors)} of visitors`} />
            <Kpi label="Live now" value={fmt(t.live)} accent />
          </div>

          {/* On-demand full export — gathers EVERYTHING only on click. */}
          <DownloadReport range={range} overview={data} />

          {/* Acquisition — where visitors came from. */}
          <Section id="acq" title="Acquisition" subtitle="where visitors came from" count={`${(data.by_channel || []).length} channels`} defaultOpen>
            <div className="pulse2-grid">
              <Breakdown title="Channels (classified)" rows={data.by_channel} labelKey="channel" />
            </div>
          </Section>

          {/* Audience — who and on what. */}
          <Section id="aud" title="Audience" subtitle="geo · device" count={`${(data.by_country || []).length} countries`}>
            <div className="pulse2-grid">
              <Breakdown title="Countries" rows={data.by_country} labelKey="country" />
              <Breakdown title="Devices" rows={data.by_device} labelKey="device_type" />
            </div>
          </Section>

          {/* Pages — engagement + on-demand heatmaps. */}
          <Section id="pages" title="Pages & heatmaps" subtitle="views, scroll, clicks, rage — heatmap on click" count={`${pages.length} pages`}>
            <PagesExplorer range={range} pages={pages} />
          </Section>

          {/* Funnels — acquisition + product. */}
          <Section id="funnels" title="Conversion funnels" subtitle="acquisition · PWA install">
            <div className="pulse-card pulse-funnel">
              <h4 className="pulse-card-title">Acquisition funnel ({range})</h4>
              <div className="pulse-funnel-row">
                <FunnelStep label="Visitors" value={funnel.visitors} base={funnel.visitors} />
                <FunnelStep label="Signed up" value={funnel.signups} base={funnel.visitors} />
                <FunnelStep label="Paid" value={funnel.paid} base={funnel.visitors} />
              </div>
            </div>
            <div className="pulse2-grid">
              <InstallFunnel pwa={data.pwa} />
            </div>
          </Section>

          {/* Daily trend. */}
          <Section id="trend" title="Daily trend" subtitle="visitors & pageviews per day" count={`${(data.timeseries || []).length} days`}>
            <div className="pulse-card">
              <Timeseries series={data.timeseries} />
            </div>
          </Section>

          {/* Visitors — the per-visitor drill-down. Self-fetches only when open. */}
          <Section id="visitors" title="Visitors" subtitle="every visitor — search, filter, drill into a journey">
            <VisitorsPanel range={range} />
          </Section>
        </>
      )}
    </section>
  );
}
