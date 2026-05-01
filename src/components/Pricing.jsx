import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { startCheckout, markPreCheckout, clearPreCheckoutSnapshot } from '../lib/checkout.js';
import { PLANS } from '../lib/plans.js';
import { friendlyError } from '../lib/errors.js';

function Check({ gold }) {
  return (
    <span className={`pc-check${gold ? ' pc-check-gold' : ''}`}>
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

export default function Pricing() {
  const { user, subscription } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [lifetimeLeft, setLifetimeLeft] = useState(null); // null until loaded

  // Live lifetime spots counter — calls the public RPC `lifetime_seats_left()`.
  useEffect(() => {
    let cancelled = false;
    supabase.rpc('lifetime_seats_left').then(({ data, error }) => {
      if (cancelled || error) return;
      if (typeof data === 'number') setLifetimeLeft(data);
    });
    return () => { cancelled = true; };
  }, []);

  const onChoose = async (plan) => {
    setError(null);
    // Not logged in → send to /login first; we'll come back to checkout after.
    if (!user) {
      navigate('/login', { state: { intent: { plan } } });
      return;
    }
    try {
      setBusy(plan);
      // Snapshot BEFORE the await — see Paywall.jsx for the why.
      markPreCheckout(subscription, user?.id);
      const url = await startCheckout(plan);
      window.location.href = url;
    } catch (e) {
      clearPreCheckoutSnapshot();
      setBusy(null);
      setError(friendlyError(e, 'Could not start checkout.'));
    }
  };

  return (
    <section id="pricing" className="pricing tm-section-pad">
      <div className="section-head">
        <p className="kicker hand">ready when you are</p>
        <h2>Pick your plan.</h2>
        <p className="lead">Every plan starts at a discount. Lifetime is capped at 10 spots.</p>
      </div>

      {error && (
        <div className="paywall-error" role="alert" style={{ maxWidth: 640, margin: '0 auto 24px' }}>
          <strong>Heads up — </strong>{error}
          <button type="button" className="paywall-link" onClick={() => setError(null)} style={{ marginLeft: 8 }}>Dismiss</button>
        </div>
      )}

      <div className="pricing-plans">
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onChoose={onChoose}
            busy={busy}
            lifetimeLeft={plan.gold ? lifetimeLeft : null}
          />
        ))}
      </div>

      <p className="pricing-foot">
        <span className="reassure-bullet">✦</span> 14-day refund
        &nbsp;·&nbsp; no hidden fees
        &nbsp;·&nbsp; cancel anytime on monthly &amp; 3-month
      </p>
    </section>
  );
}
