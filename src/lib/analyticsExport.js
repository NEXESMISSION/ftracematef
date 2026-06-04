// Full analytics export — gathers EVERYTHING the dashboard knows (and more
// detail than the visual page shows) and formats it into one readable report
// you can hand to an AI or read yourself. Runs ONLY when the operator hits
// "Download" — never on page load — so the heavy per-visitor journey fetches
// don't cost anything during normal browsing.
//
// All data comes from the existing triple-gated admin endpoints; no new
// server surface. Time-on-page is derived from the event timeline (pageview →
// next event), so we get dwell without extra tracking.

import { getAnalytics, listVisitors, getVisitorProfile, listReferrers, listAllUsers } from './admin.js';

const MAX_VISITOR_JOURNEYS = 200; // cap the per-visitor detail pull
const CONCURRENCY = 5;            // parallel visitor-profile fetches per batch

/* ── gather ──────────────────────────────────────────────────────────────── */
// onProgress(message) lets the UI show what's loading.
export async function gatherFullExport(range, { overview = null, onProgress = () => {} } = {}) {
  onProgress('Loading overview…');
  const ov = overview || (await getAnalytics(range)).overview;

  onProgress('Loading visitor list…');
  const visRes = await listVisitors(range, { limit: 200, offset: 0 });
  const visitors = visRes.rows || [];
  const totalVisitors = visRes.total || visitors.length;

  // Per-visitor journeys (the firehose). Batched so we don't open 200 sockets.
  const subset = visitors.slice(0, MAX_VISITOR_JOURNEYS);
  const journeys = [];
  for (let i = 0; i < subset.length; i += CONCURRENCY) {
    onProgress(`Loading visitor journeys ${Math.min(i + CONCURRENCY, subset.length)}/${subset.length}…`);
    const batch = subset.slice(i, i + CONCURRENCY);
    const profiles = await Promise.all(
      batch.map((r) => getVisitorProfile(r.visitor_id).catch(() => null)),
    );
    profiles.forEach((p, j) => { if (p) journeys.push({ row: batch[j], profile: p }); });
  }

  // Heatmaps for the key + busiest pages.
  onProgress('Loading page heatmaps…');
  const heatPages = [...new Set([
    '/', '/welcome', '/pricing', '/upload', '/how-to-use',
    ...(ov?.by_page || []).slice(0, 8).map((p) => p.path),
  ])].filter(Boolean).slice(0, 12);
  const heatmaps = {};
  for (const path of heatPages) {
    try {
      const h = (await getAnalytics(range, path)).heatmap;
      if (h && (h.pageviews || h.clicks)) heatmaps[path] = h;
    } catch { /* skip page on error */ }
  }

  onProgress('Loading referral / affiliate program…');
  let referrers = [];
  try { referrers = await listReferrers(); } catch { /* optional */ }

  // Every registered account, in full: profile, plan/billing, trace activity,
  // survey answers, signup attribution, referral. Operator-owned accounts
  // (admins + exclude_from_analytics) are dropped so the export matches Pulse.
  onProgress('Loading registered users…');
  let users = [];
  try {
    users = (await listAllUsers()).filter((u) => !u.is_admin && !u.exclude_from_analytics);
  } catch { /* optional */ }

  return {
    range,
    generatedAt: new Date().toISOString(),
    overview: ov,
    visitors,
    totalVisitors,
    journeys,
    heatmaps,
    referrers,
    users,
    truncatedJourneys: visitors.length > MAX_VISITOR_JOURNEYS,
  };
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
const fmtInt = (n) => (typeof n === 'number' ? n.toLocaleString() : (n ?? '0'));
const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—');
const safe = (s, dash = '—') => (s == null || s === '' ? dash : String(s));
const iso = (s) => { try { return new Date(s).toISOString(); } catch { return safe(s); } };

function secondsBetween(a, b) {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return isFinite(ms) && ms > 0 ? Math.round(ms / 1000) : 0;
}
function humanDur(sec) {
  if (!sec) return '0s';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${sec % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// Collapse a flat event stream into per-page steps: a pageview starts a step;
// scroll folds into max depth; everything else nests as an action. Returns
// [{ path, start, end, seconds, maxScroll, actions: [{type, label, at}] }].
function groupSteps(events) {
  const steps = [];
  let cur = null;
  for (const e of events || []) {
    if (e.type === 'pageview') {
      cur = { path: e.path || '/', start: e.created_at, end: e.created_at, maxScroll: 0, actions: [] };
      steps.push(cur);
    } else {
      if (!cur) { cur = { path: e.path || '/', start: e.created_at, end: e.created_at, maxScroll: 0, actions: [] }; steps.push(cur); }
      cur.end = e.created_at;
      if (e.type === 'scroll') {
        const d = Number(e.props?.depth) || 0;
        if (d > cur.maxScroll) cur.maxScroll = d;
      } else {
        let label = e.type;
        if (e.type === 'click') label = `click "${(e.props?.txt || e.props?.sel || '').slice(0, 50)}"`;
        else if (e.type === 'rage') label = `rage-click ${e.props?.sel || ''}`;
        else if (e.type === 'identify') label = 'signed in';
        else if (e.type === 'custom') label = `event: ${e.props?.name || 'custom'}`;
        cur.actions.push({ type: e.type, label, at: e.created_at });
      }
    }
  }
  for (const s of steps) s.seconds = secondsBetween(s.start, s.end);
  return steps;
}

function breakdownLines(rows, labelKey, valueKey = 'visitors') {
  if (!rows || rows.length === 0) return '  (none)';
  return rows.map((r) => `  - ${safe(r[labelKey])}: ${fmtInt(r[valueKey] || 0)}`).join('\n');
}

/* ── format ──────────────────────────────────────────────────────────────── */
export function buildReportText(b) {
  const ov = b.overview || {};
  const t = ov.totals || {};
  const f = ov.funnel || {};
  const L = [];
  const h1 = (s) => L.push(`\n${'='.repeat(72)}\n${s}\n${'='.repeat(72)}`);
  const h2 = (s) => L.push(`\n## ${s}`);

  L.push('TRACE MATE — FULL ANALYTICS EXPORT');
  L.push(`Generated: ${b.generatedAt}`);
  L.push(`Date range: ${b.range}`);
  L.push('Note: operator-owned accounts (admins + accounts flagged exclude_from_analytics) are excluded from every number below.');

  // 1. Summary
  h1('1. SUMMARY');
  L.push(`Visitors:            ${fmtInt(t.visitors)}  (${fmtInt(t.new_visitors)} new · ${fmtInt(t.returning_visitors)} returning)`);
  L.push(`Sessions:            ${fmtInt(t.sessions)}`);
  L.push(`Pageviews:           ${fmtInt(t.pageviews)}`);
  L.push(`Total events:        ${fmtInt(t.events)}`);
  L.push(`Signups:             ${fmtInt(t.signups)}  (${pct(t.signups, t.visitors)} of visitors)`);
  L.push(`Live now (5 min):    ${fmtInt(t.live)}`);
  L.push(`Pages / session:     ${t.sessions ? (t.pageviews / t.sessions).toFixed(2) : '—'}`);

  // 2. Acquisition
  h1('2. ACQUISITION — WHERE VISITORS COME FROM');
  h2('Channels (classified)');
  L.push(breakdownLines(ov.by_channel, 'channel'));
  h2('Traffic sources (your tagged / referral links)');
  L.push(breakdownLines(ov.by_source, 'source'));
  h2('Referrers (the site/app they came from)');
  L.push(breakdownLines(ov.by_referrer, 'referrer'));
  h2('Landing pages (first page on the site)');
  {
    const land = {};
    for (const j of b.journeys) {
      const lp = j.profile?.visitor?.landing_path || j.row?.landing_path;
      if (lp) land[lp] = (land[lp] || 0) + 1;
    }
    const rows = Object.entries(land).sort((a, c) => c[1] - a[1]).map(([k, v]) => `  - ${k}: ${v}`);
    L.push(rows.length ? rows.join('\n') : '  (derived from journeys — none)');
  }

  // 3. Audience
  h1('3. AUDIENCE');
  h2('Countries');
  L.push(breakdownLines(ov.by_country, 'country'));
  h2('Devices');
  L.push(breakdownLines(ov.by_device, 'device_type'));
  h2('Operating systems');
  L.push(breakdownLines(ov.by_os, 'os'));
  h2('Browsers');
  L.push(breakdownLines(ov.by_browser, 'browser'));
  h2('Languages');
  L.push(breakdownLines(ov.by_language, 'lang'));

  // 4. Pages — performance (views, unique, avg time on page, scroll, clicks)
  h1('4. PAGES — PERFORMANCE & ENGAGEMENT');
  // Avg time on page derived from all visitor journeys.
  const pageTime = {}; // path -> { totalSec, samples }
  for (const j of b.journeys) {
    for (const s of groupSteps(j.profile?.events)) {
      if (!pageTime[s.path]) pageTime[s.path] = { totalSec: 0, samples: 0, maxScrollSum: 0 };
      if (s.seconds > 0) { pageTime[s.path].totalSec += s.seconds; pageTime[s.path].samples += 1; }
      pageTime[s.path].maxScrollSum += s.maxScroll;
    }
  }
  const pages = ov.by_page || [];
  if (pages.length === 0) L.push('  (no page data)');
  for (const p of pages) {
    const pt = pageTime[p.path];
    const avg = pt && pt.samples ? humanDur(Math.round(pt.totalSec / pt.samples)) : 'n/a';
    const hm = b.heatmaps[p.path];
    L.push(`\n• ${p.path}`);
    L.push(`    views: ${fmtInt(p.views)} · unique visitors: ${fmtInt(p.visitors)} · avg time on page: ${avg}`);
    if (hm) {
      const sc = hm.scroll || {};
      L.push(`    scroll reach — 25%: ${fmtInt(sc.d25)} · 50%: ${fmtInt(sc.d50)} · 75%: ${fmtInt(sc.d75)} · 100%: ${fmtInt(sc.d100)}`);
      L.push(`    clicks: ${fmtInt(hm.clicks)}`);
      if (hm.top_elements?.length) {
        L.push('    most-clicked:');
        hm.top_elements.slice(0, 8).forEach((el) => L.push(`      - ${safe(el.txt || el.sel)} (${fmtInt(el.clicks)})`));
      }
      if (hm.rage?.length) {
        L.push('    rage clicks (frustration):');
        hm.rage.slice(0, 5).forEach((el) => L.push(`      - ${safe(el.sel)} (${fmtInt(el.count)})`));
      }
    }
  }

  // 5. Funnels
  h1('5. FUNNELS');
  h2('Acquisition funnel');
  L.push(`  Visitors:  ${fmtInt(f.visitors)}`);
  L.push(`  Signed up: ${fmtInt(f.signups)}  (${pct(f.signups, f.visitors)})`);
  L.push(`  Paid:      ${fmtInt(f.paid)}  (${pct(f.paid, f.visitors)})`);
  h2('PWA install funnel');
  {
    const p = ov.pwa || {};
    L.push(`  Promo opened: ${fmtInt(p.promo_open)} · iOS picks: ${fmtInt(p.pick_ios)} · Android picks: ${fmtInt(p.pick_android)}`);
    L.push(`  Native prompt — available: ${fmtInt(p.prompt_available)} · accepted: ${fmtInt(p.prompt_accepted)} · dismissed: ${fmtInt(p.prompt_dismissed)}`);
    L.push(`  Installed: ${fmtInt(p.installed)} · Opened as installed app: ${fmtInt(p.standalone_visitors)}`);
  }
  h2('Lifetime "secret deal" funnel');
  {
    const l = ov.lifetime || {};
    L.push(`  Teaser seen: ${fmtInt(l.teaser_views)} · Unwrapped: ${fmtInt(l.unwraps)} · Claim clicks: ${fmtInt(l.claims)}`);
  }

  // 6. Timeseries
  h1('6. DAILY TIMESERIES');
  const ts = ov.timeseries || [];
  if (ts.length === 0) L.push('  (none)');
  else ts.forEach((d) => L.push(`  ${iso(d.day).slice(0, 10)}  visitors: ${fmtInt(d.visitors)} · pageviews: ${fmtInt(d.pageviews)}`));

  // 7. Referral / affiliate program
  h1('7. REFERRAL / AFFILIATE PROGRAM');
  if (!b.referrers || b.referrers.length === 0) L.push('  (no referral partners)');
  else for (const r of b.referrers) {
    L.push(`\n• ${safe(r.name || r.code)}  [code: ${safe(r.code)}]`);
    L.push(`    signups: ${fmtInt(r.signups ?? r.signup_count)} · sales: ${fmtInt(r.sales ?? r.sale_count)} · revenue: ${safe(r.revenue_cents != null ? `$${(r.revenue_cents / 100).toFixed(2)}` : r.revenue)}`);
    L.push(`    commission: ${safe(r.commission_cents != null ? `$${(r.commission_cents / 100).toFixed(2)}` : r.commission)} · rate: ${safe(r.rate ?? r.commission_rate)} · link: ${safe(r.link || (r.code ? `/i/${r.code}` : null))}`);
  }

  // 8. Registered users — every account, full detail
  h1('8. REGISTERED USERS — every account in detail');
  if (!b.users || b.users.length === 0) L.push('  (no users, or user list unavailable)');
  else {
    L.push(`Total registered (operator-owned accounts excluded): ${b.users.length}`);
    for (const u of b.users) {
      L.push(`\n${'-'.repeat(60)}`);
      L.push(`${safe(u.email || u.display_name)}  [${safe(u.id)}]`);
      L.push(`  Joined: ${iso(u.created_at)} · last sign-in: ${iso(u.last_sign_in_at)} · last seen: ${iso(u.last_seen_at)}${u.current_page ? `  (on ${u.current_page})` : ''}`);
      L.push(`  Plan: ${safe(u.plan, 'free')} · status: ${safe(u.status)} · paid: ${u.is_paid ? 'YES' : 'no'}${u.paid_at ? ` (since ${iso(u.paid_at)})` : ''}${u.amount_cents != null ? ` · last charge $${(u.amount_cents / 100).toFixed(2)}` : ''}`);
      L.push(`  Billing: period ends ${u.current_period_end ? iso(u.current_period_end) : '—'} · cancel-at-end: ${u.cancel_at_period_end ? 'yes' : 'no'} · trial used: ${u.trial_used ? 'yes' : 'no'} · last checkout plan: ${safe(u.last_checkout_plan)}`);
      L.push(`  Funnel: first pricing ${u.first_pricing_at ? iso(u.first_pricing_at) : '—'} · first paywall ${u.first_paywall_at ? iso(u.first_paywall_at) : '—'} · first checkout ${u.first_checkout_at ? iso(u.first_checkout_at) : '—'}`);
      L.push(`  Activity: ${fmtInt(u.trace_sessions)} traces · ${humanDur(u.total_trace_seconds)} traced · last trace ${u.last_trace_at ? iso(u.last_trace_at) : '—'}${u.traces_recorded != null ? ` · ${fmtInt(u.traces_recorded)} recorded` : ''}${u.current_streak != null ? ` · streak ${u.current_streak} (best ${u.longest_streak ?? '—'})` : ''}`);
      L.push(`  Acquisition: source ${safe(u.signup_source)} · campaign ${safe(u.signup_campaign)} · landing ${safe(u.signup_landing)} · referrer ${safe(u.signup_referrer)}${u.referred_by ? ` · referred-by ${u.referred_by}` : ''}`);
      if (u.survey_completed_at) {
        const draws = Array.isArray(u.survey_draws) ? u.survey_draws.join(', ') : safe(u.survey_draws, '');
        L.push(`  Survey: age ${safe(u.survey_age)} · gender ${safe(u.survey_gender)} · draws [${draws}]${u.survey_note ? ` · note: "${String(u.survey_note).trim()}"` : ''}  (${iso(u.survey_completed_at)})`);
      } else {
        L.push('  Survey: not completed');
      }
    }
  }

  // 9. Survey aggregate
  h1('9. SURVEY — aggregate (post-trace)');
  {
    const done = (b.users || []).filter((u) => u.survey_completed_at);
    L.push(`Responses: ${done.length} of ${b.users?.length || 0} registered users (${pct(done.length, b.users?.length || 0)})`);
    const tally = (key, isArr = false) => {
      const m = {};
      for (const u of done) {
        const v = u[key];
        if (isArr) (Array.isArray(v) ? v : []).forEach((x) => { if (x) m[x] = (m[x] || 0) + 1; });
        else if (v) m[v] = (m[v] || 0) + 1;
      }
      const rows = Object.entries(m).sort((a, c) => c[1] - a[1]).map(([k, v]) => `    - ${k}: ${v}`);
      return rows.length ? rows.join('\n') : '    (none)';
    };
    L.push('  By age:'); L.push(tally('survey_age'));
    L.push('  By gender:'); L.push(tally('survey_gender'));
    L.push('  What they like to draw:'); L.push(tally('survey_draws', true));
    const notes = done.filter((u) => u.survey_note && String(u.survey_note).trim());
    if (notes.length) {
      L.push('  Notes / requests:');
      notes.forEach((u) => L.push(`    - "${String(u.survey_note).trim()}"  — ${safe(u.email || u.display_name)}`));
    }
  }

  // 10. Per-visitor journeys (the firehose)
  h1('10. PER-VISITOR JOURNEYS (anonymous + signed-in, full detail)');
  if (b.truncatedJourneys) L.push(`(Showing first ${MAX_VISITOR_JOURNEYS} of ${fmtInt(b.totalVisitors)} visitors.)`);
  b.journeys.forEach((j, idx) => {
    const v = j.profile?.visitor || j.row || {};
    const steps = groupSteps(j.profile?.events);
    const timeOnSite = v.first_seen_at && v.last_seen_at ? humanDur(secondsBetween(v.first_seen_at, v.last_seen_at)) : '—';
    L.push(`\n${'-'.repeat(60)}`);
    L.push(`Visitor #${idx + 1}  [${safe(v.visitor_id)}]`);
    L.push(`  Account:    ${v.user_id ? `${safe(v.email || v.display_name)} (${safe(v.plan, 'free')}${v.paid ? ' · PAID' : ''})` : 'anonymous'}`);
    L.push(`  From:       ${safe(v.channel)} · source: ${safe(v.source)} · referrer: ${safe(v.referrer)}`);
    L.push(`  Landed on:  ${safe(v.landing_path)}`);
    L.push(`  Location:   ${[v.city, v.country].filter(Boolean).join(', ') || '—'}  ·  ${[v.device_type, v.os, v.browser].filter(Boolean).join(' / ') || '—'}  ·  lang ${safe(v.lang)}  ·  tz ${safe(v.tz)}`);
    L.push(`  First seen: ${iso(v.first_seen_at)}  ·  Last seen: ${iso(v.last_seen_at)}  ·  Time on site: ${timeOnSite}`);
    L.push(`  Sessions:   ${fmtInt(v.sessions)} · pageviews: ${fmtInt(v.pageviews)} · pages in this journey: ${steps.length}`);
    if (steps.length) {
      L.push('  Journey (in order):');
      steps.forEach((s, i) => {
        L.push(`    ${i + 1}. ${s.path}  —  ${humanDur(s.seconds)}${s.maxScroll ? ` · scrolled ${s.maxScroll}%` : ''}`);
        s.actions.slice(0, 25).forEach((a) => L.push(`         · ${a.label}`));
      });
    }
  });

  L.push('\n\n--- end of export ---');
  return L.join('\n');
}

/* ── download ────────────────────────────────────────────────────────────── */
export function downloadText(filename, text) {
  try {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
