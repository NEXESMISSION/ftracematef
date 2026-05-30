import { useEffect, useState } from 'react';

// Inline SVG icons reused (where practical) from the Trace control dock so the
// help list mirrors the real buttons.
const Icons = {
  stop: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  ),
  opacity: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M12 3l6 7a6 6 0 11-12 0z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
      <path d="M12 3v17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </svg>
  ),
  flicker: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor" />
    </svg>
  ),
  recenter: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  ),
  flip: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M12 3v18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 3" />
      <path d="M9 7L4 12l5 5V7zM15 7l5 5-5 5V7z" fill="currentColor" />
    </svg>
  ),
  warp: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M3 7l18-2v12l-18 2z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
    </svg>
  ),
  camera: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M20 7h-3l-2-2H9L7 7H4a1 1 0 00-1 1v10a1 1 0 001 1h16a1 1 0 001-1V8a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  ),
  flash: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor" />
    </svg>
  ),
  record: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
    </svg>
  ),
  gestures: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M9 11V5.5a1.5 1.5 0 013 0V11M12 11V4.5a1.5 1.5 0 013 0V11M15 11V6.5a1.5 1.5 0 013 0V13a6 6 0 01-6 6h-1.5a4 4 0 01-3-1.4L6 15.5a1.5 1.5 0 012.2-2L9 14.5V8.5a1.5 1.5 0 013 0" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

const HELP_ITEMS = [
  { key: 'gestures', title: 'Touch gestures', desc: 'Drag with one finger to move. Pinch with two to zoom. Twist two fingers to rotate the overlay.' },
  { key: 'opacity', title: 'Opacity', desc: 'Fade the reference image up or down so you can see your paper and the trace together.' },
  { key: 'flicker', title: 'Flicker (Pulse)', desc: 'Pulses the overlay on and off so your eye can compare the drawing to the reference.' },
  { key: 'recenter', title: 'Recenter', desc: 'Snaps the overlay back to the middle at 100% with no rotation.' },
  { key: 'flip', title: 'Flip', desc: 'Mirrors the reference horizontally — handy for left/right facing subjects.' },
  { key: 'warp', title: 'Warp', desc: 'Corner-pin perspective. Drag the four corners to match an angled surface.' },
  { key: 'camera', title: 'Switch camera', desc: 'Toggle between the front and back camera.' },
  { key: 'flash', title: 'Flash', desc: 'Turns the device torch on or off (only shown if your camera supports it).' },
  { key: 'record', title: 'Record', desc: 'Records your camera view so you can save or share a timelapse of the trace.' },
  { key: 'stop', title: 'Stop', desc: 'Ends the session and returns to the home screen.' },
];

function HelpRow({ item }) {
  const [gifOk, setGifOk] = useState(true);
  return (
    <li className="trace-help-row">
      <div className="trace-help-media">
        {gifOk ? (
          <img
            src={`/images/help/${item.key}.gif`}
            alt=""
            className="trace-help-gif"
            loading="lazy"
            onError={() => setGifOk(false)}
          />
        ) : (
          <span className="trace-help-icon" aria-hidden="true">{Icons[item.key]}</span>
        )}
      </div>
      <div className="trace-help-text">
        <div className="trace-help-title">
          <span className="trace-help-inline-icon" aria-hidden="true">{Icons[item.key]}</span>
          {item.title}
        </div>
        <p>{item.desc}</p>
      </div>
    </li>
  );
}

export default function TraceHelp({ onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="trace-help-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="How TraceMate works"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="trace-help-card">
        <div className="trace-help-head">
          <h3>How TraceMate works</h3>
          <p>Every control, explained. Tap “Got it” to start tracing.</p>
        </div>
        <ul className="trace-help-list">
          {HELP_ITEMS.map((item) => (
            <HelpRow key={item.key} item={item} />
          ))}
        </ul>
        <button className="trace-help-done" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
