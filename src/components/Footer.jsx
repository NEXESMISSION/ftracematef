import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="footer">
      <svg className="footer-wave" viewBox="0 0 1280 28" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M0 14 Q 80 4 160 14 T 320 14 T 480 14 T 640 14 T 800 14 T 960 14 T 1120 14 T 1280 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          filter="url(#wcRough)"
        />
      </svg>

      <div className="footer-inner tm-section-pad">
        <div className="footer-brand">
          <img src="/images/brand/logo.webp" alt="Trace Mate" className="footer-logo" />
          <p className="footer-tag hand">See it. Trace it. Create it.</p>
          <p className="footer-sub">Made with care for creators everywhere <span aria-hidden="true">✦</span></p>
        </div>

        <div className="footer-col">
          <h4 className="footer-col-title hand">Explore</h4>
          <nav className="footer-links" aria-label="Footer navigation">
            <a href="#how">How it works</a>
            <a href="#gallery">Gallery</a>
            <a href="#pricing">Pricing</a>
          </nav>
        </div>

        <div className="footer-col">
          <h4 className="footer-col-title hand">Get in touch</h4>
          <a className="footer-mail" href="mailto:hi@tracemate.art">hi@tracemate.art</a>
          <p className="footer-note">We read every message <span aria-hidden="true">✿</span></p>
        </div>

        <div className="footer-col">
          <h4 className="footer-col-title hand">Legal</h4>
          <nav className="footer-links" aria-label="Legal links">
            <Link to="/terms">Terms of Service</Link>
            <Link to="/privacy">Privacy Policy</Link>
          </nav>
        </div>
      </div>

      <div className="footer-bottom tm-section-pad">
        <p className="footer-copy">© 2026 Trace Mate · all rights reserved</p>
        <a className="footer-top" href="#" aria-label="Back to top">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 9 L7 5 L11 9" />
          </svg>
          <span>Back to top</span>
        </a>
      </div>
    </footer>
  );
}
