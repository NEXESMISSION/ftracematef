import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import Img from './Img.jsx';

// Demo YouTube video id. Set when the demo is recorded; the button only
// renders once a real id is in place — no more dead button shipping a
// broken `YOUR_VIDEO_ID` embed.
const DEMO_VIDEO_ID = '';

// Hero centerpiece: one looping, muted, inline-autoplay reel. The MP4 is heavily
// optimized (square 800×800, no audio, +faststart so the moov atom is up front
// and playback starts before the full file lands) and a tiny WebP poster fills
// the frame instantly so it's never an empty box on first paint.
function HeroReel() {
  const videoRef = useRef(null);
  // Nudge playback on mount — some browsers (iOS Safari) need the explicit call
  // even with the autoPlay attribute.
  useEffect(() => { videoRef.current?.play?.().catch(() => {}); }, []);
  return (
    <div className="hero-phone-video">
      <video
        ref={videoRef}
        className="hero-phone-reel"
        src="/videos/hero.mp4"
        poster="/videos/hero.webp"
        muted
        loop
        autoPlay
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}

// Synchronous heuristic — see Nav.jsx for the same trick.
function hasPersistedSession() {
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) return true;
    }
  } catch { /* private mode / disabled storage */ }
  return false;
}

export default function Hero({ onPlayClick }) {
  const { user, loading } = useAuth();
  // Suppress the visitor 'Try it Now' CTA while auth is loading IF there's
  // a persisted session — otherwise the button flashes for ~1s before
  // disappearing for signed-in users.
  const isOrLikelySignedIn = user || (loading && hasPersistedSession());
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
            {/* Signed-in users get the 'See my profile' button via Nav.
                The Hero CTA is reserved for the visitor's primary action. */}
            {!isOrLikelySignedIn && (
              <Link className="img-btn" to="/upload" aria-label="Try it Now">
                <Img src="/images/ui/btn-try-now.webp" alt="Try it Now" priority />
              </Link>
            )}

            {/* Explicit sign-up path for visitors who'd rather make an account
                first than jump straight into a trial. */}
            {!isOrLikelySignedIn && (
              <Link className="btn-signup" to="/login" aria-label="Create your profile">
                Create profile
              </Link>
            )}

            {DEMO_VIDEO_ID && (
              <button type="button" className="see-action" onClick={() => onPlayClick(DEMO_VIDEO_ID)}>
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
            )}
          </div>

          {/* Returning visitors who already have an account — quiet sign-in link
              under the primary CTA so it doesn't compete with it. */}
          {!isOrLikelySignedIn && (
            <p className="hero-signin">
              Already have an account? <Link to="/login">Log in</Link>
            </p>
          )}
        </div>

        <div className="hero-phone">
          <span className="hero-spark hero-spark-l" aria-hidden="true">✦</span>
          <div className="phone-frame">
            <HeroReel />
          </div>
          <span className="hero-spark hero-spark-r" aria-hidden="true">✧</span>
        </div>
      </div>
    </section>
  );
}
