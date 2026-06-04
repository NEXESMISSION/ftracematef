import { Link, useLocation } from 'react-router-dom';

// Shared section nav for the signed-in pages. Account, Streaks and Gallery are
// each their own route now; this is the single, consistent way to move between
// them. A centered pill row that works the same on mobile and desktop.
export default function StudioTabBar() {
  const { pathname } = useLocation();
  const tab = (to, label, icon) => (
    <Link
      to={to}
      className={`studio-tab ${pathname === to ? 'is-active' : ''}`}
      aria-current={pathname === to ? 'page' : undefined}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
  return (
    <nav className="studio-tabs" aria-label="Sections">
      {tab('/account', 'Account', (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="8" r="3.6" />
          <path d="M4.5 19.5 a7.5 7.5 0 0 1 15 0" />
        </svg>
      ))}
      {tab('/streaks', 'Streaks', <span className="studio-tab-emoji" aria-hidden="true">🔥</span>)}
      {tab('/gallery', 'Gallery', (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
          <path d="M3.5 15 L8 10.5 L12 14.5 M14 12.5 L16.5 10 L20.5 14" />
          <circle cx="8.5" cy="9" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      ))}
    </nav>
  );
}
