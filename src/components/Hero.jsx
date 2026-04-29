import { Link } from 'react-router-dom';

export default function Hero({ onPlayClick }) {
  return (
    <section className="hero tm-section-pad">
      <div className="hero-grid">
        <div className="hero-copy">
          <span className="hero-eyebrow">
            <span className="eyebrow-dot" aria-hidden="true">✦</span>
            <span className="eyebrow-text">AR Trace Mate</span>
            <span className="eyebrow-sep" aria-hidden="true">·</span>
            <span className="eyebrow-tag">Early Access</span>
          </span>

          <h1 className="headline">
            Draw<br className="desktop-break" />
            <em>anything.</em>
            <br />
            On real<br className="desktop-break" />
            paper.
          </h1>

          <p className="sub">
            Point your camera at paper, see the outline overlay,
            and trace it with your favorite tools.
          </p>

          <div className="ctas">
            <Link className="img-btn" to="/login" aria-label="Try it Now">
              <img src="/images/ui/btn-try-now.webp" alt="Try it Now" />
            </Link>

            <button type="button" className="see-action" onClick={() => onPlayClick('YOUR_VIDEO_ID')}>
              <span className="play-circle" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M3 2 L12 7 L3 12 Z" />
                </svg>
              </span>
              <span className="text">
                <span className="title">See it in action</span>
                <span className="sub">30 sec demo</span>
              </span>
            </button>
          </div>
        </div>

        <div className="hero-phone">
          <span className="hero-spark hero-spark-l" aria-hidden="true">✦</span>
          <div className="phone-frame">
            <img src="/images/hero/phone-preview.webp" alt="Trace Mate app preview" />
          </div>
          <span className="hero-spark hero-spark-r" aria-hidden="true">✧</span>
        </div>
      </div>
    </section>
  );
}
