import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { VISIBLE_PLANS } from '../lib/plans.js';
import { FREE_SESSION_LIMIT } from '../lib/freeTrial.js';
import { usePlanCheckout } from '../hooks/usePlanCheckout.js';
import { useSectionView } from '../hooks/useSectionView.js';
import LifetimeReveal, { LifetimeInlineCard, hasSeenLifetime } from './LifetimeReveal.jsx';

function Check({ gold, mint }) {
  return (
    <span className={`pc-check${gold ? ' pc-check-gold' : ''}${mint ? ' pc-check-mint' : ''}`}>
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor"
           strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 2 6 L 5 9 L 10 3" />
      </svg>
    </span>
  );
}

function PlanCard({ plan, onChoose, busy, lifetimeLeft }) {
  const limitedText =
    plan.gold
      ? lifetimeLeft === null
        ? 'Limited — only 10 spots'
        : lifetimeLeft > 0
          ? `Limited — only ${lifetimeLeft} of 10 spots left`
          : 'Sold out — waitlist only'
      : null;

  const soldOut = plan.gold && lifetimeLeft === 0;
  const disabled = busy === plan.id || soldOut;

  return (
    <article className={`pricing-plan${plan.gold ? ' pricing-plan-gold' : ''}`}>
      {limitedText && (
        <div className="pricing-plan-limited">
          <span className="pulse-dot" aria-hidden="true"></span>
          {limitedText}
        </div>
      )}

      <div className="pricing-plan-name">{plan.name}</div>

      <div className="pricing-plan-price">
        <span className="strike">${plan.wasPrice}</span>
        <span className="num"><span className="currency">$</span>{plan.price}</span>
      </div>
      <div className="pricing-plan-period">{plan.period}</div>
      <div className="pricing-plan-badge">{plan.badge}</div>

      <ul className="pricing-plan-features">
        {plan.features.map((f) => (
          <li key={f}><Check gold={plan.gold} />{f}</li>
        ))}
      </ul>

      <button
        type="button"
        className={`pricing-plan-cta${plan.gold ? ' pricing-plan-cta-gold' : ''}`}
        onClick={() => onChoose(plan.id)}
        disabled={disabled}
      >
        {soldOut ? 'Sold out' : busy === plan.id ? 'Opening checkout…' : `${plan.cta} →`}
      </button>
    </article>
  );
}

// Deliberate, eased glide that brings an element to the vertical centre of the
// viewport — slower and cleaner than native smooth scroll, used to slide down to
// the secret box after the reveal popup.
function smoothScrollToCenter(el, duration = 1400) {
  try {
    const rect = el.getBoundingClientRect();
    const targetY = rect.top + window.scrollY - (window.innerHeight - rect.height) / 2;
    const startY = window.scrollY;
    const dist = targetY - startY;
    if (Math.abs(dist) < 4) return;
    const start = performance.now();
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2); // easeInOutQuad
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      window.scrollTo(0, startY + dist * ease(p));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  } catch { /* ignore */ }
}

export default function Pricing() {
  const { busy, error, lifetimeLeft, choose, dismissError } = usePlanCheckout();

  // Staged reveal: the user first sees just Free + Monthly. Two seconds after the
  // pricing section scrolls into view, a "secret deal" popup flashes and the
  // Lifetime teaser pops into the grid. Tied to view (not page load) so the
  // reveal actually happens while they're looking.
  const sectionRef = useRef(null);
  const startedRef = useRef(false);
  // Fire a one-time "reached pricing" funnel event (independent of the reveal
  // animation). Merge this ref with sectionRef on the same <section>.
  const viewRef = useSectionView('pricing', 0.3);
  const setSectionEl = (el) => { sectionRef.current = el; viewRef.current = el; };
  // Devices that already unwrapped the secret skip the whole show — Lifetime is
  // present from first paint and renders as a plain card (no teaser/confetti).
  const [seenLifetime] = useState(() => hasSeenLifetime());
  const [revealed, setRevealed] = useState(seenLifetime);
  const [announce, setAnnounce] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || seenLifetime) return undefined;
    const timers = [];
    const io = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || startedRef.current) return;
      startedRef.current = true;
      io.disconnect();
      timers.push(setTimeout(() => {
        setAnnounce(true);
        setRevealed(true);
        // Popup sits in the centre a beat, then we glide down to the secret box.
        timers.push(setTimeout(() => {
          const box = document.querySelector('.lifetime-teaser');
          if (box) smoothScrollToCenter(box, 1400);
        }, 1300));
        timers.push(setTimeout(() => setAnnounce(false), 2800));
      }, 2000));
    }, { threshold: 0.3 });
    io.observe(el);
    return () => { io.disconnect(); timers.forEach(clearTimeout); };
  }, [seenLifetime]);

  return (
    <section id="pricing" ref={setSectionEl} className="pricing tm-section-pad">
      {announce && (
        <div className="secret-announce" role="status" aria-live="polite">
          <span className="secret-announce-icon" aria-hidden="true">🎁</span>
          <span><strong>Psst…</strong> a secret deal just appeared — just for you!</span>
        </div>
      )}

      <div className="section-head">
        <p className="kicker hand">ready when you are</p>
        <h2>Pick your plan.</h2>
        <p className="lead">Every plan starts at a discount. Lifetime is capped at 10 spots.</p>
      </div>

      {error && (
        <div className="paywall-error" role="alert" style={{ maxWidth: 640, margin: '0 auto 24px' }}>
          <strong>Heads up — </strong>{error}
          <button type="button" className="paywall-link" onClick={dismissError} style={{ marginLeft: 8 }}>Dismiss</button>
        </div>
      )}

      <div className="pricing-plans">
        {/* Free starter card — the mint on-ramp, distinct from the paid (dark
            CTA) plans. The header doubles as the headline benefit, so the
            feature list only carries what it doesn't already say. */}
        <article className="pricing-plan pricing-plan-free">
          <div className="pricing-plan-name pc-free-name">Free</div>
          <ul className="pricing-plan-features">
            <li><Check />{FREE_SESSION_LIMIT} free sessions</li>
            <li><Check />All tools unlocked</li>
            <li><Check />Works on any device</li>
          </ul>
          <Link to="/upload" className="pricing-plan-cta pricing-plan-cta-free">Try it for free →</Link>
        </article>

        {VISIBLE_PLANS.map((plan) => (
          plan.gold ? (
            /* Lifetime stays out of the grid until the staged reveal fires; then
               it pops in (lf-enter) as the blurred "secret deal" teaser. Devices
               that already unwrapped it skip straight to the plain card. */
            revealed ? (
              seenLifetime ? (
                <LifetimeInlineCard
                  key={plan.id}
                  plan={plan}
                  onChoose={choose}
                  busy={busy}
                  lifetimeLeft={lifetimeLeft}
                />
              ) : (
                <LifetimeReveal
                  key={plan.id}
                  plan={plan}
                  onChoose={choose}
                  busy={busy}
                  lifetimeLeft={lifetimeLeft}
                />
              )
            ) : null
          ) : (
            <PlanCard
              key={plan.id}
              plan={plan}
              onChoose={choose}
              busy={busy}
              lifetimeLeft={null}
            />
          )
        ))}
      </div>

      <p className="pricing-foot">
        <span className="reassure-bullet">✦</span> 14-day refund
        &nbsp;·&nbsp; no hidden fees
      </p>
    </section>
  );
}
