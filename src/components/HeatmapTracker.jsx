// Heatmap + interaction collector.
//
// Mounted once near the root. Attaches document-level listeners that feed the
// analytics firehose (via lib/track.trackEvent) with three signals the
// AnalyticsPulse heatmap viewer renders:
//
//   * click  — normalised position (xpct across the viewport, ypct down the
//              full page) + the nearest meaningful element's selector & text.
//              Powers the click-density canvas and the "most-clicked elements"
//              ranking.
//   * scroll — the max depth a session reaches, emitted once per 25/50/75/100
//              milestone. Powers the scroll-depth funnel ("most people never
//              see the pricing section").
//   * rage   — 3+ clicks in the same ~30px spot within 800ms: the universal
//              "this looks clickable but isn't / is broken" tell.
//
// All coordinates are normalised so a phone and a 4K monitor land on the same
// 0..1 grid. Listeners are passive + capture-phase so they never interfere with
// the app's own handlers, and everything is wrapped so a collector bug can't
// break the page.

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackEvent } from '../lib/track.js';

// Build a short, stable-ish selector for an element: tag + #id, else
// tag + first one or two class names. Good enough to group clicks by target
// without a brittle full DOM path.
function selectorFor(el) {
  try {
    if (!el || el === document.body || el.nodeType !== 1) return 'body';
    const tag = el.tagName.toLowerCase();
    if (el.id) return `${tag}#${el.id}`;
    const cls = typeof el.className === 'string'
      ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.')
      : '';
    return cls ? `${tag}.${cls}` : tag;
  } catch { return 'unknown'; }
}

// Prefer the nearest interactive ancestor (a/button/[role=button]) so a click
// on the label *inside* a button attributes to the button, not the span.
function meaningfulTarget(el) {
  try {
    let node = el;
    for (let i = 0; node && i < 4; i++) {
      const tag = node.tagName?.toLowerCase();
      if (tag === 'a' || tag === 'button' || node.getAttribute?.('role') === 'button') return node;
      node = node.parentElement;
    }
  } catch { /* ignore */ }
  return el;
}

export default function HeatmapTracker() {
  const { pathname } = useLocation();

  // Reset per-page scroll milestones whenever the route changes.
  useEffect(() => {
    let maxDepth = 0;
    const fired = new Set();

    const docHeight = () => {
      const d = document.documentElement;
      return Math.max(d.scrollHeight, document.body.scrollHeight, d.clientHeight) || 1;
    };

    const onScroll = () => {
      try {
        const reached = Math.min(100, Math.round(((window.scrollY + window.innerHeight) / docHeight()) * 100));
        if (reached <= maxDepth) return;
        maxDepth = reached;
        for (const m of [25, 50, 75, 100]) {
          if (reached >= m && !fired.has(m)) {
            fired.add(m);
            trackEvent('scroll', { depth: m });
          }
        }
      } catch { /* ignore */ }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    // Fire once on mount in case the page is short / already scrolled.
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);

  // Click + rage detection live for the whole app lifetime (path travels with
  // each event), so this effect runs once.
  useEffect(() => {
    let recent = []; // { x, y, t } in client coords, for rage detection

    const onClick = (e) => {
      try {
        const vw = window.innerWidth || 1;
        const xpct = Math.max(0, Math.min(1, e.clientX / vw));
        const pageY = e.clientY + (window.scrollY || 0);
        const d = document.documentElement;
        const fullH = Math.max(d.scrollHeight, document.body.scrollHeight) || 1;
        const ypct = Math.max(0, Math.min(1, pageY / fullH));

        const target = meaningfulTarget(e.target);
        const sel = selectorFor(target);
        const txt = (target?.innerText || target?.textContent || '').trim().slice(0, 60);

        trackEvent('click', { xpct: +xpct.toFixed(4), ypct: +ypct.toFixed(4), sel, txt });

        // Rage: 3+ clicks within 800ms inside a ~30px box.
        const now = Date.now();
        recent = recent.filter((c) => now - c.t < 800);
        recent.push({ x: e.clientX, y: e.clientY, t: now });
        const near = recent.filter((c) =>
          Math.abs(c.x - e.clientX) < 30 && Math.abs(c.y - e.clientY) < 30);
        if (near.length >= 3) {
          trackEvent('rage', { xpct: +xpct.toFixed(4), ypct: +ypct.toFixed(4), sel, count: near.length });
          recent = []; // reset so one rage burst emits once
        }
      } catch { /* a collector error must never swallow a real click */ }
    };

    document.addEventListener('click', onClick, { capture: true, passive: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  return null;
}
