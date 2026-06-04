import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { usePresence } from '../hooks/usePresence.js';
import Community from '../components/Community.jsx';
import StudioTabBar from '../components/StudioTabBar.jsx';

// Dedicated streak leaderboard page (split out of the old combined Community
// card so it stands on its own).
export default function Streaks() {
  const { profile } = useAuth();
  usePresence('streaks');
  const streak = profile?.current_streak ?? 0;
  return (
    <div className="studio-shell">
      <header className="studio-bar">
        <Link to="/welcome" className="studio-brand" aria-label="Trace Mate home">
          <img src="/images/brand/logo.webp" alt="Trace Mate" />
        </Link>
        <div className="studio-bar-right">
          <Link to="/upload" className="studio-link">Start tracing</Link>
        </div>
      </header>

      <main className="profile-page studio-subpage">
        <StudioTabBar />
        <div className="studio-subpage-head">
          <h1>🔥 Streaks</h1>
          {streak > 0 ? (
            <p>
              You're on a <strong>{streak}-day</strong> streak
              {profile?.longest_streak > streak ? ` (best ${profile.longest_streak})` : ''} —
              trace today to keep it alive and climb the board.
            </p>
          ) : (
            <p>Trace today to start a streak. Keep it going daily to rise up the leaderboard.</p>
          )}
        </div>
        <Community mode="streaks" />
      </main>
    </div>
  );
}
