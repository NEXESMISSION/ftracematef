import { useEffect, useMemo, useRef } from 'react';

/**
 * Full-screen celebration shown the first time a user lands paid.
 * Confetti is pure CSS — particle positions / colors / delays generated
 * once on mount so the animation is identical for the run of the modal.
 *
 * The component is purely presentational: parent decides when to mount it
 * and what the primary CTA does (e.g. "Start tracing" → /trace).
 */
const CONFETTI_COUNT  = 60;
const CONFETTI_COLORS = ['#e87a7a', '#f5d77a', '#7fbf9c', '#7fb3e8', '#c89cf0', '#ffb27a', '#fff'];

function rand(min, max) { return Math.random() * (max - min) + min; }

export default function SuccessCelebration({
  open,
  onClose,
  onPrimary,
  primaryLabel = 'Start tracing',
  title = "You're in!",
  subtitle = "Welcome to Trace Mate. Your studio is unlocked — let's make something beautiful.",
}) {
  const cardRef = useRef(null);

  // Generate confetti once per mount so re-renders don't re-shuffle them.
  const confetti = useMemo(() => {
    if (!open) return [];
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      left:     `${rand(-2, 102)}%`,
      delay:    `${rand(0, 1.4).toFixed(2)}s`,
      duration: `${rand(2.4, 4.6).toFixed(2)}s`,
      drift:    `${rand(-90, 90).toFixed(0)}px`,
      rotate:   `${rand(-540, 540).toFixed(0)}deg`,
      color:    CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      shape:    i % 3 === 0 ? 'circle' : (i % 3 === 1 ? 'rect' : 'square'),
    }));
  }, [open]);

  // Lock body scroll while open + autofocus the CTA + ESC to close.
  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);

    // Defer focus so the entrance animation starts cleanly.
    const t = setTimeout(() => {
      cardRef.current?.querySelector('.celebrate-cta')?.focus();
    }, 60);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="celebrate-modal" role="dialog" aria-modal="true" aria-labelledby="celebrate-title">
      <div className="celebrate-backdrop" onClick={onClose} aria-hidden="true" />

      <div className="celebrate-confetti" aria-hidden="true">
        {confetti.map((c) => (
          <span
            key={c.id}
            className={`celebrate-piece celebrate-piece--${c.shape}`}
            style={{
              left:                       c.left,
              backgroundColor:            c.color,
              animationDelay:             c.delay,
              animationDuration:          c.duration,
              '--celebrate-drift':        c.drift,
              '--celebrate-rotate':       c.rotate,
            }}
          />
        ))}
      </div>

      <div className="celebrate-card" ref={cardRef}>
        <button
          type="button"
          className="celebrate-close"
          onClick={onClose}
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
               strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M3 3 L11 11 M11 3 L3 11" />
          </svg>
        </button>

        <div className="celebrate-burst" aria-hidden="true">
          <span className="celebrate-burst-ray celebrate-burst-ray--1" />
          <span className="celebrate-burst-ray celebrate-burst-ray--2" />
          <span className="celebrate-burst-ray celebrate-burst-ray--3" />
          <span className="celebrate-burst-ray celebrate-burst-ray--4" />
          <span className="celebrate-burst-ray celebrate-burst-ray--5" />
          <span className="celebrate-burst-ray celebrate-burst-ray--6" />
          <span className="celebrate-burst-ray celebrate-burst-ray--7" />
          <span className="celebrate-burst-ray celebrate-burst-ray--8" />
          <span className="celebrate-burst-core">
            <span className="celebrate-burst-mark">✦</span>
          </span>
        </div>

        <span className="celebrate-eyebrow">
          <span aria-hidden="true">✧</span>
          Payment confirmed
          <span aria-hidden="true">✧</span>
        </span>

        <h2 id="celebrate-title" className="celebrate-title">{title}</h2>
        <p className="celebrate-sub">{subtitle}</p>

        <button
          type="button"
          className="celebrate-cta"
          onClick={onPrimary}
        >
          {primaryLabel}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
               strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 8 H13 M9 4 L13 8 L9 12" />
          </svg>
        </button>

        <p className="celebrate-fineprint">
          Tip: you can manage your plan anytime from your account.
        </p>
      </div>
    </div>
  );
}
