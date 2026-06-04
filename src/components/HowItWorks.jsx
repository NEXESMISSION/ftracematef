// "See it in action" demo-reel is temporarily hidden — placeholder videos
// were under-quality. To bring it back: re-import DemoReel and re-render
// the .how-shorts-head + .shorts-row blocks below.
// import DemoReel from './DemoReel.jsx';

import { useEffect, useRef } from 'react';
import Img from './Img.jsx';
import { trackEvent } from '../lib/track.js';

const STEPS = [
  { src: '/images/steps/01-upload.webp',  alt: 'Step 1 — Upload or select any image.' },
  { src: '/images/steps/02-point.webp',   alt: 'Step 2 — Point your camera at your paper.' },
  { src: '/images/steps/03-outline.webp', alt: 'Step 3 — See the outline over your paper.' },
  { src: '/images/steps/04-trace.webp',   alt: 'Step 4 — Trace it with your favorite tools.' },
];

function StepArrow() {
  return (
    <svg viewBox="0 0 32 16" className="step-arrow" aria-hidden="true">
      <path
        d="M2 8 L26 8 M20 2 L26 8 L20 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function HowItWorks() {
  const ref = useRef(null);

  // Fire a single 'section' view event the first time the four-step explainer
  // scrolls into view, so the Pulse dashboard can see how many visitors reach it.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let fired = false;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !fired) {
          fired = true;
          trackEvent('section', { id: 'how' });
          io.disconnect();
        }
      }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="how" ref={ref} className="how tm-section-pad">
      <div className="section-head">
        <p className="kicker hand">how it works</p>
        <h2>Four easy steps to your line.</h2>
        <p className="lead">No drawing skills required — Trace Mate hands you the outline.</p>
      </div>

      <div className="how-grid">
        {STEPS.map((step, i) => (
          <span key={step.src} style={{ display: 'contents' }}>
            <figure className="how-card">
              <Img src={step.src} alt={step.alt} />
            </figure>
            {i < STEPS.length - 1 && <StepArrow />}
          </span>
        ))}
      </div>

    </section>
  );
}
