import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

// Floating "let's start tracing" cat CTA. Used to render unconditionally,
// which meant return visitors saw it on every reload — annoying enough on
// the same device to override its conversion-nudge value. Now it gates on
// a localStorage cooldown shared in spirit (separate key) with WelcomeOverlay:
// shown on first visit, suppressed for 30 days afterwards. Long-stale
// visitors get one fresh nudge.
const STORAGE_KEY = 'tm:popup:cat:last-shown';
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export default function CatPopup() {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    try {
      const last = Number(localStorage.getItem(STORAGE_KEY) || 0);
      if (Number.isFinite(last) && Date.now() - last < COOLDOWN_MS) return;
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
      setShouldRender(true);
    } catch {
      // Private mode / disabled storage — fall back to showing it.
      setShouldRender(true);
    }
  }, []);

  if (!shouldRender) return null;

  return (
    <Link to="/login" className="cat-popup" aria-label="Let's start tracing — sign in">
      <img src="/images/popup/floating-cat.webp" alt="Let's Start Tracing!" />
    </Link>
  );
}
