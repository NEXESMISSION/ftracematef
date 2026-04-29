import { Link } from 'react-router-dom';

const FEATURES = [
  'Full quality outlines',
  'All tools unlocked',
  'Works on any device',
  'Lifetime updates',
];

function Check() {
  return (
    <span className="check">
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor"
           strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 2 6 L 5 9 L 10 3" />
      </svg>
    </span>
  );
}

export default function Pricing() {
  return (
    <section id="pricing" className="pricing tm-section-pad">
      <div className="section-head">
        <p className="kicker hand">ready when you are</p>
        <h2>One small price. Forever access.</h2>
        <p className="lead">No subscription, no hidden fees. Just trace.</p>
      </div>

      <div className="pricing-row">
        <div className="pricing-ticket">
          <div className="pt-corner-stamp">save 80%</div>

          <div className="pt-ribbon">
            <span className="pt-ribbon-dot"></span>
            Early Access
          </div>

          <div className="pt-headline">
            The whole<br />app, <em>forever.</em>
          </div>

          <div className="pt-price">
            <div className="num"><span className="currency">$</span>5</div>
            <div className="strike">$25</div>
          </div>
          <div className="pt-price-sub">one-time · no subscription</div>

          <div className="pt-divider"></div>

          <ul className="pt-features">
            {FEATURES.map((f) => (
              <li key={f}><Check />{f}</li>
            ))}
          </ul>

          <div className="pt-cta-wrap">
            <Link className="wc-btn sm" to="/login">
              <svg className="wash" viewBox="0 0 240 70" preserveAspectRatio="none" aria-hidden="true">
                <rect x="6" y="8" width="228" height="54" rx="12" ry="12" fill="url(#wcWash)" filter="url(#wcRough)" />
                <ellipse cx="80" cy="24" rx="50" ry="14" fill="url(#wcHi)" filter="url(#wcRough)" />
                <rect x="6" y="8" width="228" height="54" rx="12" ry="12" fill="#000" filter="url(#wcGrain)" opacity="0.5" />
              </svg>
              <span className="label">Get the app →</span>
            </Link>
            <div className="pt-reassure">
              instant download · 14-day refund<br />
              <span className="reassure-bullet">✦</span> no hidden fees, ever
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
