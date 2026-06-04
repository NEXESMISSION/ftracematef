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
import { gatherFullExport, buildReportText, downloadText } from '../lib/analyticsExport.js';
import { friendlyError } from '../lib/errors.js';

export const RANGES = [
  { id: '24h', label: '24h' },
  { id: '7d',  label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'all', label: 'All time' },
];

export const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : '0');
export const pct = (num, den) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—');

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
export const channelIcon = (name) => CHANNEL_ICON[name] || '•';

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

    // Crisp on retina without over-rendering on low-DPI. Higher mapSamples +
    // softer brightness reads cleaner; warm coral markers match the brand.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: width * dpr,
      height: width * dpr,
      phi: 0,
      theta: 0.28,
      dark: 1,
      diffuse: 1.25,
      mapSamples: 22000,
      mapBrightness: 5.2,
      baseColor: [0.26, 0.28, 0.33],
      markerColor: [0.95, 0.49, 0.46],
      glowColor: [0.16, 0.18, 0.22],
      markers,
      onRender: (state) => {
        // Idle auto-spin only when not actively dragging. Slightly slower for a
        // calmer, smoother glide.
        if (!pointerDrag.current) phi += 0.0038;
        state.phi = phi + rRef.current;
        state.theta = thetaRef.current;
        state.width = width * dpr;
        state.height = width * dpr;
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
export function Breakdown({ title, rows, labelKey, valueKey = 'visitors' }) {
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
export function HeatCanvas({ points }) {
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
export function ScrollFunnel({ scroll, pageviews }) {
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

/* ── Growth Health score ──────────────────────────────────────────────────── */
// A single 0–10 read on how the top-of-funnel is doing, graded against rough but
// honest SaaS landing-page benchmarks. Three sub-scores roll up into the
// headline number:
//   • Conversion  — visitor→signup and signup→paid rates (45%)
//   • Engagement  — returning-visitor rate and pages per session (30%)
//   • Acquisition — channel diversity, i.e. not over-reliant on one source (25%)
// Everything derives from the rollup we already fetch, so there's no extra
// request and the score re-grades itself whenever you change the date range.

// Map a measured value to 0–10 against three ascending benchmark tiers.
// Below `ok` ramps 0→4, ok→good ramps 4→7, good→great ramps 7→10, ≥great = 10.
function gradeTiers(value, { ok, good, great }) {
  if (!isFinite(value) || value <= 0) return 0;
  if (value >= great) return 10;
  if (value >= good)  return 7 + (3 * (value - good)) / (great - good);
  if (value >= ok)    return 4 + (3 * (value - ok)) / (good - ok);
  return (4 * value) / ok;
}

// Effective number of channels via inverse Herfindahl (1 / Σ shareᵢ²). One
// dominant source ≈ 1; an even spread across N sources ≈ N. Rewards a
// diversified acquisition mix without punishing a healthy one.
function effectiveChannels(byChannel) {
  const rows = (byChannel || []).filter((r) => (r.visitors || 0) > 0);
  const total = rows.reduce((s, r) => s + (r.visitors || 0), 0);
  if (total <= 0) return 0;
  const hhi = rows.reduce((s, r) => { const sh = (r.visitors || 0) / total; return s + sh * sh; }, 0);
  return hhi > 0 ? 1 / hhi : 0;
}

const clamp10 = (n) => Math.max(0, Math.min(10, n));
const round1 = (n) => Math.round(n * 10) / 10;
const fmtPct = (v) => `${(v * 100).toFixed(1)}%`;
const fmtNum = (v) => v.toFixed(1);

function computeGrowthScore(data) {
  const t = data?.totals || {};
  const f = data?.funnel || {};
  const visitors  = f.visitors || t.visitors || 0;
  const signups   = (f.signups != null ? f.signups : t.signups) || 0;
  const paid      = f.paid || 0;
  const sessions  = t.sessions || 0;
  const pageviews = t.pageviews || 0;
  const returning = t.returning_visitors || 0;

  const signupRate = visitors > 0 ? signups / visitors : 0;
  const paidRate   = signups  > 0 ? paid / signups : 0;
  const returnRate = visitors > 0 ? returning / visitors : 0;
  const pps        = sessions > 0 ? pageviews / sessions : 0;
  const effCh      = effectiveChannels(data?.by_channel);

  const B = {
    signup: { ok: 0.02, good: 0.05, great: 0.10 },
    paid:   { ok: 0.02, good: 0.05, great: 0.12 },
    ret:    { ok: 0.10, good: 0.25, great: 0.40 },
    pps:    { ok: 1.5,  good: 2.5,  great: 4 },
    chan:   { ok: 1.5,  good: 3,    great: 5 },
  };

  const gSignup = gradeTiers(signupRate, B.signup);
  const gPaid   = gradeTiers(paidRate,   B.paid);
  const gReturn = gradeTiers(returnRate, B.ret);
  const gPps    = gradeTiers(pps,        B.pps);
  const gChan   = gradeTiers(effCh,      B.chan);

  const conversion  = clamp10((gSignup + gPaid) / 2);
  const engagement  = clamp10((gReturn + gPps) / 2);
  const acquisition = clamp10(gChan);
  const overall = round1(clamp10(conversion * 0.45 + engagement * 0.30 + acquisition * 0.25));

  const metrics = [
    {
      key: 'signup', label: 'Signup rate', display: fmtPct(signupRate), grade: gSignup,
      goal: `${(B.signup.good * 100).toFixed(0)}%+`,
      tipLow: 'Few visitors sign up. Tighten the hero promise, surface the CTA above the fold, and cut fields before the signup wall.',
      tipMid: 'Signup rate is decent. Test CTA copy and place social proof right beside it to push past the 5% mark.',
    },
    {
      key: 'paid', label: 'Free → paid', display: fmtPct(paidRate), grade: gPaid,
      goal: `${(B.paid.good * 100).toFixed(0)}%+`,
      tipLow: 'Signups rarely convert to paid. Add an in-product nudge at the free-session limit and make the upgrade value obvious.',
      tipMid: 'Paid conversion is okay. Try a time-boxed first-purchase discount and clearer plan framing on the paywall.',
    },
    {
      key: 'ret', label: 'Returning visitors', display: fmtPct(returnRate), grade: gReturn,
      goal: `${(B.ret.good * 100).toFixed(0)}%+`,
      tipLow: 'Most visitors never come back. Capture emails earlier and add a reason to return (saved work, streaks, reminders).',
      tipMid: 'Return rate is healthy-ish. Lifecycle email or a "your trace is waiting" nudge can lift it further.',
    },
    {
      key: 'pps', label: 'Pages / session', display: fmtNum(pps), grade: gPps,
      goal: `${B.pps.good}+`,
      tipLow: 'Sessions are shallow. Add clear next-step links between sections so visitors explore beyond the landing page.',
      tipMid: 'Depth is okay. Stronger internal links from the hero to pricing / how-to-use will deepen sessions.',
    },
    {
      key: 'chan', label: 'Channel diversity', display: `${fmtNum(effCh)} eff.`, grade: gChan,
      goal: `${B.chan.good}+`,
      tipLow: 'Traffic leans on one source — risky. Open a second channel (SEO, a social loop, or referrals) to de-risk growth.',
      tipMid: 'Channel mix is forming. Double down on the two best performers and seed one more to spread the risk.',
    },
  ];

  const weakest = metrics.reduce((lo, m) => (m.grade < lo.grade ? m : lo), metrics[0]);
  const tip = overall >= 8
    ? 'Strong all round — keep the funnel instrumented and protect what is working.'
    : (weakest.grade < 4 ? weakest.tipLow : weakest.tipMid);

  return { overall, conversion, engagement, acquisition, metrics, weakestKey: weakest.key, tip, sample: visitors };
}

const SCORE_COLOR = (s) => (s >= 7 ? '#3f9e6b' : s >= 4 ? '#d99021' : '#e0524b');
const verdict = (s) =>
  s >= 8 ? 'Excellent' : s >= 6.5 ? 'Healthy' : s >= 4.5 ? 'Mixed' : s >= 2.5 ? 'Needs work' : 'Critical';

function ScoreGauge({ score }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const frac = Math.max(0, Math.min(1, score / 10));
  const color = SCORE_COLOR(score);
  return (
    <div className="pulse-score-gauge">
      <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--cream-deep)" strokeWidth="11" />
        <circle
          cx="60" cy="60" r={R} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="pulse-score-num">
        <span className="pulse-score-value" style={{ color }}>{score.toFixed(1)}</span>
        <span className="pulse-score-outof">/ 10</span>
      </div>
    </div>
  );
}

function SubScore({ label, value }) {
  const color = SCORE_COLOR(value);
  return (
    <div className="pulse-subscore">
      <div className="pulse-subscore-head">
        <span className="pulse-subscore-label">{label}</span>
        <span className="pulse-subscore-value" style={{ color }}>{value.toFixed(1)}</span>
      </div>
      <span className="pulse-subscore-track">
        <span className="pulse-subscore-fill" style={{ width: `${value * 10}%`, background: color }} />
      </span>
    </div>
  );
}

function MetricRow({ m, weakest }) {
  const color = SCORE_COLOR(m.grade);
  // Status vs the benchmark: grade ≥7 meets the "good" tier, 4–7 is close, <4 below.
  const status = m.grade >= 7 ? { sym: '✓', cls: 'is-pass' }
    : m.grade >= 4 ? { sym: '~', cls: 'is-near' }
    : { sym: '✗', cls: 'is-below' };
  return (
    <li className={`pulse-metric-row ${weakest ? 'is-weakest' : ''}`}>
      <span className="pulse-metric-label">{m.label}</span>
      <span className="pulse-metric-track">
        {/* Benchmark tick sits at the "good" tier (grade 7 = 70%). */}
        <span className="pulse-metric-bench" style={{ left: '70%' }} aria-hidden="true" />
        <span className="pulse-metric-fill" style={{ width: `${m.grade * 10}%`, background: color }} />
      </span>
      <span className="pulse-metric-val">{m.display}</span>
      <span className={`pulse-metric-goal ${status.cls}`}>{status.sym} target {m.goal}</span>
    </li>
  );
}

function GrowthScore({ data, range }) {
  const s = useMemo(() => computeGrowthScore(data), [data]);
  const lowData = s.sample < 50;
  const rangeLabel = (RANGES.find((r) => r.id === range) || {}).label || range;
  return (
    <div className="pulse-card pulse-score-card">
      <div className="pulse-score-main">
        <ScoreGauge score={s.overall} />
        <div className="pulse-score-headline">
          <h4 className="pulse-card-title" style={{ margin: 0 }}>Growth Health</h4>
          <p className="pulse-score-verdict" style={{ color: SCORE_COLOR(s.overall) }}>
            {verdict(s.overall)}
          </p>
          <p className="pulse-score-meta">
            Funnel · engagement · acquisition, graded vs benchmarks · {rangeLabel}
          </p>
          {lowData && (
            <p className="pulse-score-lowdata">
              ⚠ Only {fmt(s.sample)} visitors in range — score is directional until you have more traffic.
            </p>
          )}
        </div>
        <div className="pulse-subscores">
          <SubScore label="Conversion" value={s.conversion} />
          <SubScore label="Engagement" value={s.engagement} />
          <SubScore label="Acquisition" value={s.acquisition} />
        </div>
      </div>

      <ul className="pulse-metrics">
        {s.metrics.map((m) => (
          <MetricRow key={m.key} m={m} weakest={m.key === s.weakestKey} />
        ))}
      </ul>

      <p className="pulse-score-legend">
        Each bar fills to its 0–10 grade; the tick marks the benchmark (the
        industry “good” tier). <b className="is-pass">✓</b> meets it,{' '}
        <b className="is-near">~</b> is close, <b className="is-below">✗</b> is below.
      </p>

      <p className="pulse-score-tip">
        <span className="pulse-score-tip-icon" aria-hidden="true">💡</span>
        <span><strong>Biggest lever:</strong> {s.tip}</span>
      </p>
    </div>
  );
}

/* ── App install funnel (PWA) ─────────────────────────────────────────────── */
// Rolls up the pwa_* custom events into the install journey: promo opened on
// the account page → platform chosen → native prompt offered/accepted →
// installed → opened as a standalone app. Reads overview.pwa (added by the
// pwa_install_tracking migration); degrades to an empty state on older data.
function InstallStat({ label, value, hint, accent }) {
  return (
    <div className={`pulse-install-stat ${accent ? 'is-accent' : ''}`}>
      <span className="pulse-install-value">{fmt(value || 0)}</span>
      <span className="pulse-install-label">{label}</span>
      {hint && <span className="pulse-install-hint">{hint}</span>}
    </div>
  );
}

export function InstallFunnel({ pwa }) {
  const p = pwa || {};
  const promoOpen   = p.promo_open || 0;
  const pickIos     = p.pick_ios || 0;
  const pickAndroid = p.pick_android || 0;
  const promptAvail = p.prompt_available || 0;
  const accepted    = p.prompt_accepted || 0;
  const dismissed   = p.prompt_dismissed || 0;
  const installed   = p.installed || 0;
  const standalone  = p.standalone_visitors || 0;
  const anyData = promoOpen || pickIos || pickAndroid || promptAvail || installed || standalone;

  const platformMax = Math.max(pickIos, pickAndroid, 1);

  return (
    <div className="pulse-card pulse-install">
      <h4 className="pulse-card-title">App installs (PWA)</h4>
      {!anyData ? (
        <p className="pulse-empty">No install activity in this range yet.</p>
      ) : (
        <>
          <div className="pulse-install-grid">
            <InstallStat label="Installed" value={installed} hint="appinstalled fired" accent />
            <InstallStat label="Using the app" value={standalone} hint="opened standalone" accent />
            <InstallStat label="Promo opened" value={promoOpen} hint="tapped “Install app”" />
            <InstallStat label="Native prompts" value={promptAvail} hint={`${fmt(accepted)} accepted · ${fmt(dismissed)} dismissed`} />
          </div>

          <div className="pulse-install-platforms">
            {[
              { label: 'iOS — Safari steps', v: pickIos, icon: '' },
              { label: 'Android — Chrome steps', v: pickAndroid, icon: '🤖' },
            ].map((row) => (
              <div key={row.label} className="pulse-bar-row">
                <span className="pulse-bar-label">{row.icon} {row.label}</span>
                <span className="pulse-bar-track">
                  <span className="pulse-bar-fill" style={{ width: `${(row.v / platformMax) * 100}%` }} />
                </span>
                <span className="pulse-bar-value">{fmt(row.v)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Lifetime "secret deal" funnel ────────────────────────────────────────── */
// teaser seen → unwrapped (boom + popup) → claim clicked. Reads overview.lifetime
// (added by the lifetime_tracking migration); empty-states on older data.
export function LifetimeFunnel({ lifetime }) {
  const l = lifetime || {};
  const views = l.teaser_views || 0;
  const unwraps = l.unwraps || 0;
  const claims = l.claims || 0;
  const any = views || unwraps || claims;
  return (
    <div className="pulse-card pulse-install">
      <h4 className="pulse-card-title">Lifetime offer — the secret deal</h4>
      {!any ? (
        <p className="pulse-empty">No Lifetime activity in this range yet.</p>
      ) : (
        <div className="pulse-install-grid">
          <InstallStat label="Teaser seen" value={views} hint="scrolled into view" />
          <InstallStat label="Unwrapped" value={unwraps} hint={`${pct(unwraps, views)} of views`} accent />
          <InstallStat label="Claim clicks" value={claims} hint={`${pct(claims, unwraps)} of unwraps`} accent />
        </div>
      )}
    </div>
  );
}

/* ── full export (download-only) ──────────────────────────────────────────── */
// One button that, on click, gathers EVERYTHING (per-visitor journeys, clicks,
// scroll depth, time-on-page, sources, referrers, referral program, heatmaps)
// and downloads it as a detailed text report. Nothing here loads until clicked.
export function DownloadReport({ range, overview }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');

  const run = async () => {
    if (busy) return;
    setBusy(true); setErr(''); setStatus('Starting…');
    try {
      const bundle = await gatherFullExport(range, { overview, onProgress: setStatus });
      setStatus('Formatting report…');
      const text = buildReportText(bundle);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadText(`tracemate-analytics-${range}-${stamp}.txt`, text);
      setStatus(`Done — exported ${fmt(bundle.journeys.length)} visitor journeys of ${fmt(bundle.totalVisitors)}.`);
    } catch (e) {
      setErr(friendlyError(e, 'Could not build the export.'));
      setStatus('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pulse-export">
      <div className="pulse-export-info">
        <strong>Full data export</strong>
        <span>Everything, in detail — journeys · clicks · scroll · time on page · sources · referrals. Loads only when you download.</span>
      </div>
      <button type="button" className="pulse-export-btn" onClick={run} disabled={busy}>
        {busy ? 'Gathering…' : '⬇ Download everything'}
      </button>
      {(status || err) && (
        <p className={`pulse-export-status ${err ? 'is-err' : ''}`} role="status">{err || status}</p>
      )}
    </div>
  );
}

/* ── main ─────────────────────────────────────────────────────────────────── */
export default function AnalyticsPulse() {
  const [range, setRange] = useState('7d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Overview load only (on range change). This is the lightweight rollup that
  // powers the visual page. The heavy per-visitor journeys + heatmaps are NOT
  // fetched here — they load only when the operator hits "Download everything".
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

  const t = data?.totals || {};
  const funnel = data?.funnel || {};
  const countries = data?.by_country || [];

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
          {/* Full data export — gathers EVERYTHING on demand (journeys, clicks,
              scroll, time-on-page, sources, referrals) and downloads it. Loads
              nothing until clicked, so the visual page stays light. */}
          <DownloadReport range={range} overview={data} />

          {/* Growth Health — the interpreted headline that grades the raw KPIs
              below against benchmarks. Re-computed client-side per range. */}
          <GrowthScore data={data} range={range} />

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

          <p className="pulse-export-foot">
            Want the deep detail — every visitor journey, clicks, scroll, time on
            each page, referrers and referral links? Use <strong>Download
            everything</strong> at the top. It loads on demand and never slows
            this page down.
          </p>
        </>
      )}
    </section>
  );
}

/* ── per-visitor drill-down ───────────────────────────────────────────────── */
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
// "2m ago" / "3h ago" / "5d ago" — friendlier than a full timestamp in a dense
// table. Falls back to a date for anything older than a month.
const LIVE_WINDOW_MS = 5 * 60 * 1000;
const relTime = (s) => {
  try {
    const diff = Date.now() - new Date(s).getTime();
    if (!isFinite(diff) || diff < 0) return fmtTime(s);
    const sec = Math.round(diff / 1000);
    if (sec < 60) return 'just now';
    const m = Math.round(sec / 60); if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);   if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);   if (d < 30) return `${d}d ago`;
    return new Date(s).toLocaleDateString();
  } catch { return '—'; }
};
const isLive = (s) => { try { return Date.now() - new Date(s).getTime() < LIVE_WINDOW_MS; } catch { return false; } };

function AccountCell({ r }) {
  if (!r.signed_up) return <span className="pulse-vis-anon">anonymous</span>;
  const who = r.email || r.display_name || 'account';
  return (
    <span className="pulse-vis-account">
      <span className="pulse-vis-email" title={who}>{who}</span>
      <span className={`pulse-badge ${r.paid ? 'pulse-badge-paid' : 'pulse-badge-free'}`}>
        {r.paid ? (r.plan || 'paid') : 'free'}
      </span>
    </span>
  );
}

export function VisitorsPanel({ range }) {
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
      <div className="pulse-vis-toolbar">
        <input
          type="search"
          className="pulse-vis-search"
          placeholder="Search email, city, country, source, referrer…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <label className="pulse-vis-check">
          <input type="checkbox" checked={onlySignedUp} onChange={(e) => setOnlySignedUp(e.target.checked)} />
          Signed-up only
        </label>
        <span className="pulse-vis-count">{fmt(total)} visitors</span>
      </div>

      {err && <p className="admin-error" role="alert">{err}</p>}
      {loading && <p className="pulse-empty">Loading visitors…</p>}
      {!loading && rows.length === 0 && !err && <p className="pulse-empty">No visitors match.</p>}

      {!loading && rows.length > 0 && (
        <div className="pulse-vis-tablewrap">
          <table className="pulse-vis-table">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Came from</th>
                <th>Location</th>
                <th>Device</th>
                <th>Account</th>
                <th>Last seen</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.visitor_id} onClick={() => setSelected(r.visitor_id)}>
                  <td className="pulse-vis-channel"><span aria-hidden="true">{channelIcon(r.channel)}</span>{r.channel || '—'}</td>
                  <td title={r.referrer || ''}>{shortRef(r.referrer)}</td>
                  <td>{[r.city, r.country].filter(Boolean).join(', ') || '—'}</td>
                  <td>{[r.device_type, r.os].filter(Boolean).join(' · ') || '—'}</td>
                  <td><AccountCell r={r} /></td>
                  <td className="pulse-vis-seen" title={fmtDate(r.last_seen_at)}>
                    {isLive(r.last_seen_at) && <span className="pulse-live-dot" aria-hidden="true" />}
                    {relTime(r.last_seen_at)}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="pulse-range-btn"
                      onClick={(e) => { e.stopPropagation(); setSelected(r.visitor_id); }}
                    >View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE && (
        <div className="pulse-vis-pager">
          <button type="button" className="pulse-range-btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Prev</button>
          <span className="pulse-vis-pageinfo">Page {page} / {pages}</span>
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
      <div className="pulse-field-label">{label}</div>
      <div className="pulse-field-value">{value}</div>
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
    label = <em className="pulse-act-signin">Signed in</em>;
  } else if (e.type === 'rage') {
    label = <>Rage click <span className="pulse-act-sel">{clip(e.props?.sel, 32)}</span></>;
  } else if (e.type === 'custom') {
    label = clip(e.props?.name || 'event');
  } else { // click
    const raw = e.props?.txt || e.props?.sel || '';
    label = (!e.props?.txt && isSelectorLabel(raw))
      ? <span className="pulse-act-sel">{clip(raw, 40)}</span>
      : <span>“{clip(raw)}”</span>;
  }
  return (
    <div className="pulse-act-row">
      <span className="pulse-act-icon" aria-hidden="true">{meta.icon}</span>
      <span className="pulse-act-label">{label}</span>
      <span className="pulse-act-time">{fmtTime(e.created_at)}</span>
    </div>
  );
}

function ScrollChip({ depth }) {
  return (
    <span className="pulse-scrollchip">
      <span className="pulse-scrollchip-track">
        <span className="pulse-scrollchip-fill" style={{ width: `${depth}%` }} />
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

  // Close on Escape — a modal should always be dismissable from the keyboard.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const v = profile?.visitor || null;
  const events = profile?.events || [];
  const steps = useMemo(() => groupTimeline(events), [events]);

  const signedUp = !!(v && v.user_id);
  const name = v ? (v.display_name || v.email || (signedUp ? 'Account' : 'Anonymous visitor')) : '';
  const initial = (v?.display_name || v?.email || '?').trim().charAt(0).toUpperCase() || '🌐';
  const conv = !v ? null
    : v.paid ? { label: 'PAID', cls: 'pulse-conv-paid' }
    : signedUp ? { label: 'MEMBER', cls: 'pulse-conv-member' }
    : { label: 'ANONYMOUS', cls: 'pulse-conv-anon' };

  return (
    <div onClick={onClose} className="pulse-modal-overlay" role="dialog" aria-modal="true">
      <div onClick={(e) => e.stopPropagation()} className="pulse-modal">
        <div className="pulse-modal-head">
          <h4 className="pulse-card-title" style={{ margin: 0 }}>Visitor journey</h4>
          <button type="button" className="pulse-range-btn" onClick={onClose}>Close</button>
        </div>

        {err && <p className="admin-error" role="alert">{err}</p>}
        {loading && <p className="pulse-empty">Loading…</p>}

        {v && (
          <>
            {/* Identity header */}
            <div className="pulse-id-head">
              <div className={`pulse-avatar ${signedUp ? 'is-member' : ''}`}>{initial}</div>
              <div className="pulse-id-main">
                <div className="pulse-id-name">{name}</div>
                <div className="pulse-id-chips">
                  <span className="pulse-chip">{channelIcon(v.channel)} {v.channel || '—'}</span>
                  {(v.city || v.country) && <span className="pulse-chip">📍 {[v.city, v.country].filter(Boolean).join(', ')}</span>}
                  <span className="pulse-chip">🖥 {[v.device_type, v.os].filter(Boolean).join(' · ') || '—'}</span>
                </div>
              </div>
              {conv && <span className={`pulse-conv ${conv.cls}`}>{conv.label}</span>}
            </div>

            {/* Compact facts */}
            <div className="pulse-facts">
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
              <ol className="pulse-timeline">
                {steps.map((g, i) => (
                  <li key={i} className={`pulse-step ${i === steps.length - 1 ? 'is-last' : ''}`}>
                    {i !== steps.length - 1 && <span className="pulse-step-line" />}
                    <span className="pulse-step-dot">{i + 1}</span>
                    <div className="pulse-step-head">
                      <strong className="pulse-step-path">{g.path}</strong>
                      <span className="pulse-step-time">{fmtTime(g.start)}</span>
                      {g.maxScroll > 0 && <ScrollChip depth={g.maxScroll} />}
                    </div>
                    {g.actions.length > 0 && (
                      <div className="pulse-step-actions">
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

export function Kpi({ label, value, sub, accent }) {
  return (
    <div className={`pulse-kpi ${accent ? 'pulse-kpi-accent' : ''}`}>
      <span className="pulse-kpi-label">{label}</span>
      <span className="pulse-kpi-value">{value}</span>
      {sub && <span className="pulse-kpi-sub">{sub}</span>}
    </div>
  );
}

export function FunnelStep({ label, value, base }) {
  const v = value || 0;
  return (
    <div className="pulse-funnel-step">
      <span className="pulse-funnel-value">{fmt(v)}</span>
      <span className="pulse-funnel-label">{label}</span>
      <span className="pulse-funnel-pct">{pct(v, base)}</span>
    </div>
  );
}
