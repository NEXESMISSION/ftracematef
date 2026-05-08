import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

const STEPS = {
  ios: {
    title: 'Install on iPhone',
    sub: 'Open this page in Safari, then follow these steps:',
    items: [
      { img: '/images/install/ios-step-1.webp', text: 'Tap the Share button at the bottom of Safari.' },
      { img: '/images/install/ios-step-2.webp', text: 'Scroll down and tap "Add to Home Screen".' },
      { img: '/images/install/ios-step-3.webp', text: 'Tap "Add" in the top-right corner.' },
      { img: '/images/install/ios-step-4.webp', text: 'Open Trace Mate from your Home Screen — done!' },
    ],
  },
  android: {
    title: 'Install on Android',
    sub: 'Open this page in Chrome, then follow these steps:',
    items: [
      { img: '/images/install/android-step-1.webp', text: 'Tap the menu (⋮) and choose "Add to home screen".' },
      { img: '/images/install/android-step-2.webp', text: 'Tap "Create shortcut" (or "Install" if shown).' },
      { img: '/images/install/android-step-3.webp', text: 'Open Trace Mate from your Home Screen — done!' },
    ],
  },
};

export default function InstallModal({ platform, onClose }) {
  const open = !!platform;
  const data = platform ? STEPS[platform] : null;
  const total = data ? data.items.length : 0;

  // Slider index — reset back to 0 every time the platform changes so a
  // user reopening the modal lands on step 1, not wherever they left off
  // last time.
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [platform]);

  const prev = useCallback(() => setIndex((i) => (i - 1 + total) % total), [total]);
  const next = useCallback(() => setIndex((i) => (i + 1) % total), [total]);

  // Keyboard: Esc closes, ←/→ navigate. Effect re-binds when handlers
  // change so prev/next see the latest `total`.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape')         onClose();
      else if (e.key === 'ArrowLeft')  prev();
      else if (e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose, prev, next]);

  // Portal to <body> so the modal escapes the surrounding section's
  // stacking context. The site sets `section { position: relative;
  // z-index: 1 }` on every section, which means a modal rendered inside
  // <GetApp> (a section) is trapped at z-index ≤ 1 in document order,
  // and the <Footer> renders OVER it because it comes later in the DOM.
  // Portal hoists the markup out to <body> where its own z-index wins.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className={`install-modal${open ? ' is-open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={data ? data.title : 'Install Trace Mate'}
      aria-hidden={!open}
    >
      <div className="install-modal-backdrop" onClick={onClose}></div>
      <div className="install-modal-inner">
        <button type="button" className="install-modal-close" aria-label="Close" onClick={onClose}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.5" strokeLinecap="round">
            <path d="M6 6 L18 18 M18 6 L6 18" />
          </svg>
        </button>

        {data && (
          <>
            <div className="install-modal-head">
              <h3 className="install-modal-title">{data.title}</h3>
              <p className="install-modal-sub">{data.sub}</p>
            </div>

            <div className="install-slider">
              {/* Slide track. transform: translateX moves the row of full-
                  width images so only one is visible at a time. The hidden
                  ones still load eagerly (only ~30KB each) so swipes feel
                  instant. */}
              <div
                className="install-slider-track"
                style={{ transform: `translateX(-${index * 100}%)` }}
              >
                {data.items.map((step, i) => (
                  <figure className="install-slide" key={i} aria-hidden={i !== index}>
                    <img src={step.img} alt={`Step ${i + 1}: ${step.text}`} />
                  </figure>
                ))}
              </div>

              {/* Arrows. Only render when there's somewhere to go — at the
                  edges, the disabled side fades + becomes non-interactive
                  so users can tell the deck has ends. */}
              <button
                type="button"
                className="install-arrow install-arrow-prev"
                onClick={prev}
                disabled={index === 0}
                aria-label="Previous step"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 6 L9 12 L15 18" />
                </svg>
              </button>
              <button
                type="button"
                className="install-arrow install-arrow-next"
                onClick={next}
                disabled={index === total - 1}
                aria-label="Next step"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6 L15 12 L9 18" />
                </svg>
              </button>
            </div>

            {/* Caption + step counter live OUTSIDE the slider so swiping
                images doesn't affect them — the operative text stays
                anchored while the visual changes. */}
            <div className="install-caption">
              <span className="install-step-num">{index + 1}</span>
              <p className="install-step-text">{data.items[index].text}</p>
            </div>

            {/* Dot indicators — extra reassurance about position in the
                deck, doubles as click-to-jump targets. */}
            <div className="install-dots" role="tablist" aria-label="Step navigation">
              {data.items.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Go to step ${i + 1}`}
                  className={`install-dot ${i === index ? 'is-active' : ''}`}
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
