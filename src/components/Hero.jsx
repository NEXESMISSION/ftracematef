import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import Img from './Img.jsx';
import InstallModal from './InstallModal.jsx';
import {
  trackEvent, trackInstall, isStandalone,
  isInstallPromptAvailable, promptInstall,
} from '../lib/track.js';

// Demo YouTube video id. Set when the demo is recorded; the button only
// renders once a real id is in place — no more dead button shipping a
// broken `YOUR_VIDEO_ID` embed.
const DEMO_VIDEO_ID = '';

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

// Coarse device class for choosing the hero CTA: phones get the matching
// install button, desktop gets "Try it now". iPadOS 13+ masquerades as a Mac,
// so a touch-capable "Mac" is treated as iOS (it can install the PWA too).
function detectDevice() {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPod/i.test(ua)) return 'ios';
  if (/iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}

export default function Hero({ onPlayClick }) {
  const { user, loading } = useAuth();
  // Suppress the visitor CTA while auth is loading IF there's a persisted
  // session — otherwise the button flashes for ~1s before disappearing for
  // signed-in users.
  const isOrLikelySignedIn = user || (loading && hasPersistedSession());

  // Computed once on mount (client-only — the prerendered crawler body never
  // runs this).
  const [device] = useState(detectDevice);
  const [standalone] = useState(() => isStandalone());
  // Platform for the step-by-step InstallModal (iOS always; Android only as a
  // fallback when no native prompt is available).
  const [modalPlatform, setModalPlatform] = useState(null);

  const isMobile = device === 'ios' || device === 'android';
  // Show the install CTA only to visitors on a phone who aren't already running
  // the installed app. Desktop (and already-installed) visitors get "Try it now".
  const showInstall = isMobile && !standalone;

  const onAndroidInstall = async () => {
    trackInstall('pwa_pick_android');
    // Direct, one-tap native install when Chrome has offered the prompt.
    if (isInstallPromptAvailable()) {
      const outcome = await promptInstall();
      if (outcome) return; // accepted or dismissed natively — nothing more to show
    }
    // No native prompt available (already used, or unsupported browser) →
    // fall back to the "Add to home screen" step guide.
    setModalPlatform('android');
  };

  const onIosInstall = () => {
    trackInstall('pwa_pick_ios');
    // iOS Safari has no programmatic install — always show the step guide.
    setModalPlatform('ios');
  };

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
            {/* Signed-in users get their actions via Nav; the hero CTA is the
                visitor's primary action. Desktop → "Try it now"; phone → the
                matching one-tap install button. */}
            {!isOrLikelySignedIn && (
              showInstall ? (
                device === 'android' ? (
                  <button
                    type="button"
                    className="img-btn"
                    onClick={onAndroidInstall}
                    aria-label="Install on Android"
                  >
                    <Img src="/images/store/android.webp" alt="Install on Android" priority />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="img-btn"
                    onClick={onIosInstall}
                    aria-label="Install on iPhone"
                  >
                    <Img src="/images/store/ios.webp" alt="Install on iPhone" priority />
                  </button>
                )
              ) : (
                <Link
                  className="img-btn"
                  to="/upload"
                  aria-label="Try it Now"
                  onClick={() => trackEvent('custom', { name: 'hero_try_now' })}
                >
                  <Img src="/images/ui/btn-try-now.webp" alt="Try it Now" priority />
                </Link>
              )
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
            <Img src="/images/hero/phone-preview-v3.webp" alt="Trace Mate app preview" priority />
          </div>
          <span className="hero-spark hero-spark-r" aria-hidden="true">✧</span>
        </div>
      </div>

      {/* iOS guide / Android fallback steps. Portaled to <body> by InstallModal. */}
      <InstallModal platform={modalPlatform} onClose={() => setModalPlatform(null)} />
    </section>
  );
}
