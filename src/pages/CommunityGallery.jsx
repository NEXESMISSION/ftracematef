import { Link } from 'react-router-dom';
import { usePresence } from '../hooks/usePresence.js';
import Community from '../components/Community.jsx';
import StudioTabBar from '../components/StudioTabBar.jsx';

// Dedicated community gallery page (the creations feed), split out of the old
// combined Community card.
export default function CommunityGallery() {
  usePresence('gallery');
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
          <h1>Gallery</h1>
          <p>What the community is tracing. Tap any piece to compare it with its reference.</p>
        </div>
        <Community mode="gallery" />
      </main>
    </div>
  );
}
