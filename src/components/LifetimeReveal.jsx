import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * LifetimeReveal — the Lifetime plan as a "secret deal, just for you".
 *
 * In the pricing grid it shows as a BLURRED, shimmering gold card with a
 * "tap to unwrap" veil. Tapping fires a full-screen confetti boom and opens a
 * gold celebration popup that reveals the real Lifetime offer, complete with a
 * live countdown timer for urgency. The actual checkout still routes through the
 * same usePlanCheckout `choose(planId)` as every other plan.
 */

const BOOM_COLORS = ['#e87a7a', '#f5d77a', '#7fbf9c', '#7fb3e8', '#c89cf0', '#ffb27a', '#ffe6a0', '#fff'];

/* ── confetti boom ──────────────────────────────────────────────────────────
 * Particles explode outward from screen center, spin, then fall + fade. Pure
 * CSS via per-piece custom properties; fixed + pointer-events:none so it plays
 * over the popup without blocking it. */
function ConfettiBoom() {
  const pieces = useMemo(() => Array.from({ length: 110 }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const dist = 130 + Math.random() * 300;
    return {
      id: i,
      tx: Math.round(Math.cos(angle) * dist),
      ty: Math.round(Math.sin(angle) * dist),
      fall: 60 + Math.round(Math.random() * 160),
      color: BOOM_COLORS[i % BOOM_COLORS.length],
      delay: (Math.random() * 0.12).toFixed(2),
      dur: (0.9 + Math.random() * 0.8).toFixed(2),
      size: 6 + Math.round(Math.random() * 9),
      rot: Math.round(Math.random() * 720 - 360),
      shape: i % 3,
    };
  }), []);

  return (
    <div className="boom" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className={`boom-piece boom-piece--${p.shape}`}
          style={{
            '--tx': `${p.tx}px`,
            '--ty': `${p.ty}px`,
            '--fall': `${p.fall}px`,
            '--rot': `${p.rot}deg`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ── countdown ──────────────────────────────────────────────────────────────
 * A personal 24h offer window, stamped in localStorage on first reveal so it
 * doesn't reset on refresh (and doesn't restart once expired — that would read
 * as fake). Returns padded h/m/s + expired flag, ticking every second. */
const DEADLINE_KEY = 'tm:lifetime-deadline';
const OFFER_WINDOW_MS = 24 * 60 * 60 * 1000;

function readDeadline() {
  try {
    const raw = Number(window.localStorage.getItem(DEADLINE_KEY));
    if (raw && !Number.isNaN(raw)) return raw;
    const d = Date.now() + OFFER_WINDOW_MS;
    window.localStorage.setItem(DEADLINE_KEY, String(d));
    return d;
  } catch {
    return Date.now() + OFFER_WINDOW_MS;
  }
}

const pad = (n) => String(n).padStart(2, '0');

function useCountdown() {
  const deadlineRef = useRef(null);
  if (deadlineRef.current == null) deadlineRef.current = readDeadline();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = Math.max(0, deadlineRef.current - now);
  const total = Math.floor(ms / 1000);
  return {
    h: pad(Math.floor(total / 3600)),
    m: pad(Math.floor((total % 3600) / 60)),
    s: pad(total % 60),
    expired: ms <= 0,
  };
}

function GoldCheck() {
  return (
    <span className="lf-check">
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor"
           strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 2 6 L 5 9 L 10 3" />
      </svg>
    </span>
  );
}

/* ── reveal popup ───────────────────────────────────────────────────────── */
function LifetimeModal({ plan, lifetimeLeft, busy, onChoose, onClose }) {
  const { h, m, s, expired } = useCountdown();

  const soldOut = lifetimeLeft === 0;
  const spotsText =
    lifetimeLeft === null ? 'Only 10 spots, ever'
    : lifetimeLeft > 0 ? `Only ${lifetimeLeft} of 10 spots left`
    : 'Sold out — waitlist only';

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="lf-modal" role="dialog" aria-modal="true" aria-label="Lifetime offer">
      <div className="lf-modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="lf-modal-card">
        <button type="button" className="lf-modal-close" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.4" strokeLinecap="round"><path d="M6 6 L18 18 M18 6 L6 18" /></svg>
        </button>

        {/* radiating sunburst behind the header */}
        <div className="lf-rays" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, i) => <span key={i} className="lf-ray" style={{ '--i': i }} />)}
        </div>

        <span className="lf-eyebrow"><span aria-hidden="true">✦</span> Just for you <span aria-hidden="true">✦</span></span>
        <h2 className="lf-title">Lifetime</h2>
        <p className="lf-sub">{spotsText} — pay once, trace forever.</p>

        <div className="lf-price">
          <span className="lf-strike">${plan.wasPrice}</span>
          <span className="lf-amount"><span className="lf-cur">$</span>{plan.price}</span>
          <span className="lf-badge">{plan.badge}</span>
        </div>

        {/* countdown */}
        <div className={`lf-countdown ${expired ? 'is-expired' : ''}`}>
          <span className="lf-countdown-label">{expired ? 'Offer ended' : 'Your price holds for'}</span>
          <div className="lf-clock" aria-hidden="true">
            <span className="lf-clock-unit"><b>{h}</b><i>hrs</i></span>
            <span className="lf-clock-sep">:</span>
            <span className="lf-clock-unit"><b>{m}</b><i>min</i></span>
            <span className="lf-clock-sep">:</span>
            <span className="lf-clock-unit"><b>{s}</b><i>sec</i></span>
          </div>
        </div>

        <ul className="lf-features">
          {plan.features.map((f) => <li key={f}><GoldCheck />{f}</li>)}
        </ul>

        <button
          type="button"
          className="lf-claim"
          onClick={() => onChoose(plan.id)}
          disabled={busy === plan.id || soldOut}
        >
          {soldOut ? 'Sold out' : busy === plan.id ? 'Opening checkout…' : `${plan.cta} →`}
        </button>
        <p className="lf-fineprint">✦ 14-day refund · no hidden fees</p>
      </div>
    </div>,
    document.body,
  );
}

/* ── blurred teaser tile (lives in the pricing grid) ──────────────────────── */
export default function LifetimeReveal({ plan, lifetimeLeft, busy, onChoose }) {
  const [open, setOpen] = useState(false);
  const [booming, setBooming] = useState(false);
  const boomTimer = useRef(null);

  const reveal = () => {
    setOpen(true);
    setBooming(true);
    clearTimeout(boomTimer.current);
    boomTimer.current = setTimeout(() => setBooming(false), 2000);
  };

  useEffect(() => () => clearTimeout(boomTimer.current), []);

  return (
    <>
      <article
        className="pricing-plan pricing-plan-gold lifetime-teaser"
        role="button"
        tabIndex={0}
        aria-label="Reveal the secret Lifetime offer"
        onClick={reveal}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reveal(); } }}
      >
        {/* Real-ish content, blurred so the gold card teases through the veil. */}
        <div className="lifetime-teaser-blur" aria-hidden="true">
          <div className="pricing-plan-name">Lifetime</div>
          <div className="pricing-plan-price">
            <span className="strike">${plan.wasPrice}</span>
            <span className="num"><span className="currency">$</span>{plan.price}</span>
          </div>
          <div className="pricing-plan-period">{plan.period}</div>
          <ul className="pricing-plan-features">
            {plan.features.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </div>

        {/* Shimmer sweep + floating sparkles + the call to unwrap. */}
        <div className="lifetime-teaser-veil">
          <span className="lifetime-spark lifetime-spark--1" aria-hidden="true">✦</span>
          <span className="lifetime-spark lifetime-spark--2" aria-hidden="true">✧</span>
          <span className="lifetime-spark lifetime-spark--3" aria-hidden="true">✦</span>
          <span className="lifetime-spark lifetime-spark--4" aria-hidden="true">✧</span>
          <span className="lifetime-gift" aria-hidden="true">🎁</span>
          <span className="lifetime-teaser-eyebrow">Just for you</span>
          <strong className="lifetime-teaser-title">A secret deal</strong>
          <span className="lifetime-teaser-cta">Tap to unwrap <span aria-hidden="true">✦</span></span>
        </div>
      </article>

      {booming && <ConfettiBoom />}
      {open && (
        <LifetimeModal
          plan={plan}
          lifetimeLeft={lifetimeLeft}
          busy={busy}
          onChoose={onChoose}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
