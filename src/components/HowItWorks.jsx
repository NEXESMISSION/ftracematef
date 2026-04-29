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

function ShortPlaceholder() {
  return (
    <figure className="short-card">
      <div className="short-placeholder">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5v14l11-7z" fill="currentColor" />
        </svg>
      </div>
    </figure>
  );
}

export default function HowItWorks() {
  return (
    <section id="how" className="how tm-section-pad">
      <div className="section-head">
        <p className="kicker hand">how it works</p>
        <h2>Four easy steps to your line.</h2>
        <p className="lead">No drawing skills required — Trace Mate hands you the outline.</p>
      </div>

      <div className="how-grid">
        {STEPS.map((step, i) => (
          <span key={step.src} style={{ display: 'contents' }}>
            <figure className="how-card">
              <img src={step.src} alt={step.alt} />
            </figure>
            {i < STEPS.length - 1 && <StepArrow />}
          </span>
        ))}
      </div>

      <div className="how-shorts-head">
        <p className="kicker hand">in motion</p>
        <h3>See it in action.</h3>
      </div>

      <div className="shorts-row">
        {Array.from({ length: 5 }).map((_, i) => (
          <ShortPlaceholder key={i} />
        ))}
      </div>
    </section>
  );
}
