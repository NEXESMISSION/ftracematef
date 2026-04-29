import { useEffect, useState } from 'react';

// First-visit welcome sequence: t1 → t2 → flies to popup spot.
// Skipped on subsequent reloads in the same session via sessionStorage.
export default function WelcomeOverlay() {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('tm-popups-shown')) return;
      sessionStorage.setItem('tm-popups-shown', '1');
      setShouldRender(true);
    } catch {
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
