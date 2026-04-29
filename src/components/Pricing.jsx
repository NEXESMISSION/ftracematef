import { Link } from 'react-router-dom';

const PLANS = [
  {
    id: 'monthly',
    name: 'Monthly',
    period: '/ month',
    price: 5,
    wasPrice: 7,
    badge: '29% off',
    cta: 'Start Monthly',
    features: [
      'Full quality outlines',
      'All tools unlocked',
      'Works on any device',
      'Cancel anytime',
    ],
  },
  {
    id: 'quarterly',
    name: '3 Months',
    period: '/ 3 months',
    price: 10,
    wasPrice: 13,
    badge: '23% off',
    cta: 'Get 3 Months',
    features: [
      'Full quality outlines',
      'All tools unlocked',
      'Works on any device',
      'Save 33% vs monthly',
    ],
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    period: 'one-time · forever',
    price: 15,
    wasPrice: 20,
    badge: '25% off',
    cta: 'Claim Lifetime',
    gold: true,
    limited: 'Limited — only 10 spots',
    features: [
      'Full quality outlines',
      'All tools unlocked, forever',
      'Works on any device',
      'Lifetime updates included',
    ],
  },
];

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

function PlanCard({ plan }) {
  return (
    <article className={`pricing-plan${plan.gold ? ' pricing-plan-gold' : ''}`}>
      {plan.limited && (
        <div className="pricing-plan-limited">
          <span className="pulse-dot" aria-hidden="true"></span>
          {plan.limited}
        </div>
      )}

      <div className="pricing-plan-name">{plan.name}</div>

      <div className="pricing-plan-price">
        <span className="strike">${plan.wasPrice}</span>
        <span className="num">
          <span className="currency">$</span>{plan.price}
        </span>
      </div>
      <div className="pricing-plan-period">{plan.period}</div>
      <div className="pricing-plan-badge">{plan.badge}</div>

      <ul className="pricing-plan-features">
        {plan.features.map((f) => (
          <li key={f}><Check gold={plan.gold} />{f}</li>
        ))}
      </ul>

      <Link
        className={`pricing-plan-cta${plan.gold ? ' pricing-plan-cta-gold' : ''}`}
        to="/login"
      >
        {plan.cta} →
      </Link>
    </article>
  );
}

export default function Pricing() {
  return (
    <section id="pricing" className="pricing tm-section-pad">
      <div className="section-head">
        <p className="kicker hand">ready when you are</p>
        <h2>Pick your plan.</h2>
        <p className="lead">Every plan starts at a discount. Lifetime is capped at 10 spots.</p>
      </div>

      <div className="pricing-plans">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>

      <p className="pricing-foot">
        <span className="reassure-bullet">✦</span> 14-day refund
        &nbsp;·&nbsp; no hidden fees
        &nbsp;·&nbsp; cancel any time on monthly &amp; 3-month
      </p>
    </section>
  );
}
