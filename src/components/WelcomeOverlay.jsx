import { useEffect, useState } from 'react';

// First-visit welcome sequence: t1 → t2 → flies to popup spot.
//
// Cooldown lives in localStorage (NOT sessionStorage) so a return visitor
// in a fresh browser tab on the same device doesn't get the animation
// re-played. Re-shows after the cooldown so a long-stale visitor gets a
// fresh impression — long enough to feel "I haven't seen this in a while",
// short enough to not break for someone who used to come weekly.
const STORAGE_KEY  = 'tm:popup:welcome:last-shown';
const COOLDOWN_MS  = 30 * 24 * 60 * 60 * 1000; // 30 days

export default function WelcomeOverlay() {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    try {
      const last = Number(localStorage.getItem(STORAGE_KEY) || 0);
      if (Number.isFinite(last) && Date.now() - last < COOLDOWN_MS) return;
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
      setShouldRender(true);
    } catch {
      // Private mode / disabled storage — fall back to showing the
      // welcome rather than suppressing it.
      setShouldRender(true);
    }
  }, []);

  if (!shouldRender) return null;

  return (
    <div className="welcome-overlay" aria-hidden="true">
      <div className="welcome-backdrop"></div>
      <img className="welcome-card welcome-1" src="/images/welcome/welcome-1.webp" alt="" />
      <img className="welcome-card welcome-2" src="/images/welcome/welcome-2.webp" alt="" />
    </div>
  );
}
